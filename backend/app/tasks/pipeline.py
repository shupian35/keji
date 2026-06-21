"""核心视频处理流水线 — Celery 异步任务"""

import logging
from pathlib import Path

from app.config import settings
from app.database import SyncSessionLocal, init_db_sync
from app.tasks.worker import celery_app

logger = logging.getLogger(__name__)


def _update_video_status(video_id: str, status: str, progress: float, error: str | None = None):
    """更新数据库中的视频状态。"""
    from app.models.task import Video

    with SyncSessionLocal() as db:
        video = db.query(Video).filter(Video.id == video_id).first()
        if video:
            video.status = status
            video.progress = progress
            if error:
                video.error_message = error
            db.commit()


@celery_app.task(bind=True, max_retries=1)
def process_video(self, video_id: str):
    """
    视频处理主流水线。

    步骤：
    1. 更新视频状态为 processing
    2. 提取音频: video_utils.extract_audio(video.file_path) -> audio_path
    3. 语音转写: transcriber.transcribe(audio_path) -> segments
    4. （可选）定时截帧并获取画面描述
    5. 整理数据，构建 LLM prompt
    6. 调用 llm.generate_notes_sync(transcript_segments) -> markdown
    7. 解析结果并存储笔记到数据库
    8. 更新任务状态为 done
    """
    # 确保表存在
    init_db_sync()

    video_id_str = str(video_id)
    logger.info("开始处理视频: %s", video_id_str)

    audio_path = None  # 用于失败时清理

    def _progress(progress: float, step: str):
        """更新 Celery 任务状态和数据库进度。"""
        self.update_state(
            state="PROCESSING",
            meta={"progress": progress, "step": step, "video_id": video_id_str},
        )
        _update_video_status(video_id_str, "processing", progress)
        logger.info("[%.1f%%] %s", progress * 100, step)

    try:
        # ── 步骤 1: 获取视频信息 ────────────────────
        _progress(0.0, "读取视频信息...")

        from app.models.task import Video, Note

        db = SyncSessionLocal()
        try:
            video = db.query(Video).filter(Video.id == video_id_str).first()
            if not video:
                raise ValueError(f"视频不存在: {video_id_str}")

            video.status = "processing"
            video.progress = 0.0
            db.commit()

            video_path = video.file_path
            video_filename = video.filename
        finally:
            db.close()

        if not Path(video_path).exists():
            raise FileNotFoundError(f"视频文件不存在: {video_path}")

        # ── 步骤 2: 提取音频 ────────────────────────
        _progress(0.05, "提取音频...")

        from app.services.video_utils import extract_audio, get_audio_duration

        audio_dir = Path(settings.media_dir) / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)
        audio_path = audio_dir / f"{video_id_str}.wav"

        extract_audio(video_path, audio_path)
        audio_duration = get_audio_duration(audio_path)
        logger.info("音频提取完成: %s (时长 %.1fs)", audio_path, audio_duration)

        # 更新数据库中的 audio_path
        db = SyncSessionLocal()
        try:
            video = db.query(Video).filter(Video.id == video_id_str).first()
            if video:
                video.audio_path = str(audio_path)
                db.commit()
        finally:
            db.close()

        # ── 步骤 3: 语音转写 ────────────────────────
        _progress(0.15, "语音识别中（可能需要几分钟）...")

        from app.services.transcriber import get_transcriber

        transcriber = get_transcriber()
        transcript_segments = transcriber.transcribe(
            str(audio_path), language="zh", duration=audio_duration
        )

        if not transcript_segments:
            raise ValueError("语音转写结果为空，请检查音频是否包含有效语音")

        logger.info(
            "转写完成: %d 个片段, 总时长 %.0fs",
            len(transcript_segments),
            transcript_segments[-1]["end"] if transcript_segments else 0,
        )

        # ── 步骤 4: （可选）定时截帧 ────────────────
        _progress(0.4, "视频分析中...")

        screenshot_descriptions = None  # 暂不启用（阶段 3 可扩展）

        # ── 步骤 5-6: LLM 生成笔记 ──────────────────
        _progress(0.5, "AI 生成笔记中...")

        from app.services.llm import generate_notes_sync

        note_data = generate_notes_sync(
            transcript_segments,
            screenshot_descriptions=screenshot_descriptions,
        )

        _progress(0.85, "保存笔记...")

        # ── 步骤 7: 存储笔记到数据库 ────────────────
        import uuid as uuid_mod

        db = SyncSessionLocal()
        try:
            # 删除旧笔记（重试场景）
            db.query(Note).filter(Note.video_id == video_id_str).delete()

            note = Note(
                id=str(uuid_mod.uuid4()),
                video_id=video_id_str,
                content_md=note_data.get("markdown_content", ""),
            )
            note.set_segments(note_data.get("segments", []))
            note.set_transcript(transcript_segments)
            db.add(note)

            # 更新视频状态
            video = db.query(Video).filter(Video.id == video_id_str).first()
            if video:
                video.status = "done"
                video.progress = 1.0

            db.commit()
            logger.info("笔记已保存: %s", note.id)
        finally:
            db.close()

        # ── 步骤 8: 完成 ────────────────────────────
        # 注意: 不要再调用 _progress(1.0, ...)，否则会把数据库中的 "done" 覆盖回 "processing"

        return {
            "status": "done",
            "video_id": video_id_str,
            "note_id": str(note.id),
            "segments_count": len(note_data.get("segments", [])),
        }

    except Exception as e:
        logger.exception("视频处理失败: %s", e)
        # 清理提取的音频文件
        if audio_path and Path(audio_path).exists():
            try:
                Path(audio_path).unlink()
                logger.info("已清理音频文件: %s", audio_path)
            except OSError:
                logger.warning("无法清理音频文件: %s", audio_path)
        _update_video_status(video_id_str, "failed", 0.0, error=str(e))
        raise
