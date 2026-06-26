"""视频相关 API 路由"""

import io
import uuid
import zipfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models.task import Video, Note
from app.schemas import (
    BatchDownloadRequest,
    MessageResponse,
    NoteResponse,
    TaskResponse,
    VideoStatus,
    VideoResponse,
)

router = APIRouter(tags=["videos"])

# 允许的媒体 MIME 类型（视频 + 音频）
ALLOWED_MEDIA_TYPES = {
    "video/mp4",
    "video/x-msvideo",   # AVI
    "video/x-matroska",  # MKV
    "video/quicktime",   # MOV
    "video/webm",
    "audio/mpeg",        # MP3
    "audio/wav",
    "audio/x-m4a",       # M4A
    "audio/aac",
    "audio/ogg",
    "audio/flac",
}
MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024  # 2 GB


def _validate_uuid(s: str) -> str:
    """验证字符串是否为合法 UUID，返回规范化的小写字符串。"""
    try:
        return str(uuid.UUID(s))
    except ValueError:
        raise HTTPException(status_code=400, detail=f"无效的 UUID 格式: {s}")


@router.post("/videos/upload", response_model=TaskResponse)
async def upload_video(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    上传视频文件，创建处理任务。

    1. 验证文件类型和大小
    2. 保存文件到 upload_dir
    3. 创建数据库 Video 记录
    4. 派发 Celery 异步处理任务
    5. 返回 task_id（即 video_id）
    """
    # ── 验证 ────────────────────────────────────────
    if file.content_type and file.content_type not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {file.content_type}。"
                   f"支持: {', '.join(ALLOWED_MEDIA_TYPES)}",
        )

    # ── 保存文件 ────────────────────────────────────
    upload_dir = settings.get_upload_path()
    video_id = str(uuid.uuid4())
    ext = Path(file.filename or "video.mp4").suffix or ".mp4"
    safe_filename = f"{video_id}{ext}"
    file_path = upload_dir / safe_filename

    # 流式写入（8MB 分块，避免大文件撑爆内存）
    file_size = 0
    try:
        with open(file_path, "wb") as f:
            while chunk := await file.read(8 * 1024 * 1024):
                file_size += len(chunk)
                if file_size > MAX_UPLOAD_SIZE:
                    f.close()
                    file_path.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail="文件大小超过 2 GB 上限")
                f.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"文件保存失败: {e}")

    # ── 创建数据库记录 ──────────────────────────────
    video = Video(
        id=video_id,
        filename=file.filename or "unknown",
        file_path=str(file_path.absolute()),
        status=VideoStatus.pending.value,
        progress=0.0,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)

    # ── 派发 Celery 任务 ────────────────────────────
    task_submitted = False
    try:
        from app.tasks.pipeline import process_video

        process_video.delay(video.id)
        task_submitted = True
    except Exception as e:
        # Celery 不可用时降级：任务保持在 pending 状态
        # 用户需手动启动 worker 或使用 /retry 接口
        print(f"[WARN] Celery 任务提交失败 (Redis 不可用?): {e}")

    return TaskResponse(
        task_id=video.id,
        status=VideoStatus.pending,
        progress=0.0,
        video_id=video.id,
        filename=video.filename,
        step="已加入处理队列" if task_submitted else "已保存，等待 Worker 处理",
    )


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task_status(
    task_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    查询任务处理状态。

    优先查 Celery 任务状态（实时进度），回退到数据库状态。
    """
    task_id = _validate_uuid(task_id)

    # 先查数据库获取 filename
    db_result = await db.execute(
        select(Video).where(Video.id == task_id)
    )
    video = db_result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="任务不存在")

    filename = video.filename

    # ── 尝试从 Celery 获取实时进度 ──────────────────
    try:
        from celery.result import AsyncResult
        from app.tasks.worker import celery_app

        result = AsyncResult(task_id, app=celery_app)

        if result.state == "PROCESSING":
            meta = result.info or {}
            vid = meta.get("video_id", task_id)
            return TaskResponse(
                task_id=task_id,
                status=VideoStatus.processing,
                progress=float(meta.get("progress", 0.0)),
                video_id=str(vid) if vid else None,
                filename=filename,
                step=str(meta.get("step", "")),
            )
        elif result.state == "SUCCESS":
            result_data = result.result or {}
            vid = result_data.get("video_id", task_id)
            return TaskResponse(
                task_id=task_id,
                status=VideoStatus.done,
                progress=1.0,
                video_id=str(vid) if vid else None,
                filename=filename,
                step="处理完成",
            )
        elif result.state == "FAILURE":
            return TaskResponse(
                task_id=task_id,
                status=VideoStatus.failed,
                progress=0.0,
                filename=filename,
                error=str(result.info) if result.info else "未知错误",
            )
    except Exception:
        pass  # Celery 不可用，回退到数据库

    # ── 回退：从数据库读取 ──────────────────────────
    return TaskResponse(
        task_id=video.id,
        status=VideoStatus(video.status),
        progress=video.progress,
        video_id=video.id,
        filename=filename,
        error=video.error_message,
    )


@router.get("/videos/{video_id}/notes", response_model=NoteResponse)
async def get_video_notes(
    video_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    获取视频对应的结构化笔记。

    返回 markdown_content。
    """
    video_id = _validate_uuid(video_id)

    # 查询 Video + 关联 Note
    result = await db.execute(
        select(Video)
        .options(selectinload(Video.note))
        .where(Video.id == video_id)
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="视频不存在")

    if not video.note:
        raise HTTPException(status_code=404, detail="笔记尚未生成，请等待处理完成")

    note = video.note
    transcript_raw = note.get_transcript()
    transcript = [seg.get("text", "") for seg in transcript_raw if seg.get("text")]

    return NoteResponse(
        video_id=video.id,
        filename=video.filename,
        note_id=note.id,
        content_md=note.content_md,
        transcript=transcript,
    )


@router.get("/videos/{video_id}/media")
async def get_video_media(
    video_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    返回视频文件流（用于前端 <video> 播放）。

    自动支持 Range 请求以支持视频拖动。
    """
    video_id = _validate_uuid(video_id)

    result = await db.execute(
        select(Video).where(Video.id == video_id)
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="视频不存在")

    file_path = Path(video.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="视频文件已被删除")

    return FileResponse(
        path=str(file_path),
        media_type="video/mp4",
        filename=video.filename,
    )


@router.post("/videos/{video_id}/retry", response_model=MessageResponse)
async def retry_video_processing(
    video_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    重新提交处理任务（用于失败重试或 Worker 恢复后触发 pending 任务）。
    """
    video_id = _validate_uuid(video_id)

    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="视频不存在")

    # 重置状态
    video.status = VideoStatus.pending.value
    video.progress = 0.0
    video.error_message = None
    await db.commit()

    # 重新派发任务
    try:
        from app.tasks.pipeline import process_video

        process_video.delay(video.id)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"任务队列不可用: {e}")

    return MessageResponse(message="已重新加入处理队列")


@router.post("/videos/{video_id}/regenerate-notes", response_model=MessageResponse)
async def regenerate_video_notes(
    video_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    重新生成 AI 课程笔记。

    如果已有转写原文，直接用 AI 重新生成笔记（跳过音频转写）。
    如果没有转写原文，走完整处理流水线。
    """
    video_id = _validate_uuid(video_id)

    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="视频不存在")

    # 重置状态
    video.status = VideoStatus.pending.value
    video.progress = 0.0
    video.error_message = None
    await db.commit()

    # 派发重新生成笔记任务
    try:
        from app.tasks.pipeline import regenerate_notes

        regenerate_notes.delay(video.id)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"任务队列不可用: {e}")

    return MessageResponse(message="已重新生成笔记")


@router.post("/videos/batch-download")
async def batch_download_videos(
    request: BatchDownloadRequest,
    db: AsyncSession = Depends(get_db),
):
    if len(request.video_ids) > 50:
        raise HTTPException(status_code=400, detail="Too many videos requested (max 50)")

    # 去重并验证UUID格式
    unique_ids = list(dict.fromkeys(request.video_ids))
    validated_ids = [_validate_uuid(vid) for vid in unique_ids]

    result = await db.execute(
        select(Video).where(Video.id.in_(validated_ids))
    )
    videos = result.scalars().all()

    if len(videos) != len(validated_ids):
        found_ids = {v.id for v in videos}
        missing_ids = set(validated_ids) - found_ids
        raise HTTPException(status_code=404, detail=f"Videos not found: {missing_ids}")

    non_completed = [v for v in videos if v.status != "done"]
    if non_completed:
        raise HTTPException(
            status_code=400,
            detail=f"Videos not completed: {[v.id for v in non_completed]}",
        )

    notes_result = await db.execute(
        select(Note).where(Note.video_id.in_(validated_ids))
    )
    notes = notes_result.scalars().all()
    notes_by_video = {n.video_id: n for n in notes}

    try:
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for video in videos:
                note = notes_by_video.get(video.id)
                if note:
                    # 去掉源文件扩展名，只保留基本名称
                    stem = Path(video.filename).stem
                    note_filename = f"{stem}.md"
                    zip_file.writestr(note_filename, note.content_md)

        zip_buffer.seek(0)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"batch_download_{timestamp}.zip"

        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成ZIP文件失败: {str(e)}")


@router.get("/videos", response_model=list[VideoResponse])
async def list_videos(
    db: AsyncSession = Depends(get_db),
):
    """列出最近上传的视频（按时间倒序，最多 50 条）。"""
    result = await db.execute(
        select(Video).order_by(Video.created_at.desc()).limit(50)
    )
    videos = result.scalars().all()
    return [
        VideoResponse(
            id=str(uuid.UUID(v.id)),
            filename=v.filename,
            status=VideoStatus(v.status),
            progress=v.progress,
            created_at=v.created_at,
        )
        for v in videos
    ]


class VideoUpdate(BaseModel):
    filename: str = Field(..., min_length=1, max_length=512)


@router.patch("/videos/{video_id}", response_model=VideoResponse)
async def update_video(
    video_id: str,
    body: VideoUpdate,
    db: AsyncSession = Depends(get_db),
):
    """更新视频文件名。"""
    video_id = _validate_uuid(video_id)

    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="视频不存在")

    video.filename = body.filename
    await db.commit()
    await db.refresh(video)

    return VideoResponse(
        id=str(uuid.UUID(video.id)),
        filename=video.filename,
        status=VideoStatus(video.status),
        progress=video.progress,
        created_at=video.created_at,
    )


@router.delete("/videos/{video_id}", response_model=MessageResponse)
async def delete_video(
    video_id: str,
    db: AsyncSession = Depends(get_db),
):
    """删除视频记录、关联笔记和物理文件。"""
    video_id = _validate_uuid(video_id)

    result = await db.execute(
        select(Video).options(selectinload(Video.note)).where(Video.id == video_id)
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="视频不存在")

    # 删除物理文件
    file_path = Path(video.file_path)
    if file_path.exists():
        file_path.unlink(missing_ok=True)

    # 删除音频文件（如果存在）
    if video.audio_path:
        audio_path = Path(video.audio_path)
        if audio_path.exists():
            audio_path.unlink(missing_ok=True)

    # 删除关联笔记
    if video.note:
        await db.delete(video.note)

    # 删除视频记录
    await db.delete(video)
    await db.commit()

    return MessageResponse(message="已删除")
