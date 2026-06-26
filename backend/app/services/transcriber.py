"""语音转写服务封装 — 使用 OpenAI 兼容协议"""

import logging
import re
import subprocess
import tempfile
from pathlib import Path

from openai import OpenAI

from app.config import settings
from app.settings_utils import get_setting_value_sync

logger = logging.getLogger(__name__)

CHUNK_DURATION = 600  # 每段 10 分钟


class Transcriber:
    """
    语音识别服务，使用 OpenAI 兼容协议调用 ASR API。
    长音频自动在静音处切分转写。

    用法:
        transcriber = Transcriber()
        segments = transcriber.transcribe("audio.wav")
        # [{"text": "完整转写文本..."}]
    """

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or get_setting_value_sync("STT_API_KEY", settings.siliconflow_api_key)

    @property
    def model(self) -> str:
        return get_setting_value_sync("STT_MODEL", settings.siliconflow_model)

    @property
    def base_url(self) -> str:
        return get_setting_value_sync("STT_API_URL", settings.siliconflow_base_url)

    def _get_client(self) -> OpenAI:
        return OpenAI(api_key=self.api_key, base_url=self.base_url)

    def _get_duration(self, audio_path: Path) -> float:
        """获取音频时长（秒）"""
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path)],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ffprobe 失败: {result.stderr}")
        return float(result.stdout.strip())

    def _detect_silence(self, audio_path: Path, min_silence: float = 0.5, noise: str = "-30dB") -> list[float]:
        """检测音频中的静音点，返回静音开始时间列表"""
        result = subprocess.run(
            ["ffmpeg", "-i", str(audio_path), "-af",
             f"silencedetect=noise={noise}:d={min_silence}",
             "-f", "null", "-"],
            capture_output=True, text=True, timeout=600,
        )
        times = []
        for match in re.finditer(r"silence_start:\s*([\d.]+)", result.stderr):
            times.append(float(match.group(1)))
        return sorted(times)

    def _split_audio(self, audio_path: Path, max_duration: int, tmpdir: Path) -> list[Path]:
        """在静音处切分音频，每段不超过 max_duration 秒"""
        total = self._get_duration(audio_path)
        if total <= max_duration:
            return [audio_path]

        silence_points = self._detect_silence(audio_path)
        logger.info("检测到 %d 个静音点", len(silence_points))

        splits = [0.0]
        pos = 0.0
        while pos + max_duration < total:
            target = pos + max_duration
            candidates = [t for t in silence_points if pos + 60 < t < target + max_duration * 0.1]
            if candidates:
                split_at = min(candidates, key=lambda t: abs(t - target))
            else:
                split_at = target
            splits.append(split_at)
            pos = split_at

        chunks = []
        for i in range(len(splits)):
            start = splits[i]
            end = splits[i + 1] if i + 1 < len(splits) else total
            chunk_path = tmpdir / f"chunk_{i:03d}.wav"
            result = subprocess.run(
                ["ffmpeg", "-y", "-i", str(audio_path), "-ss", f"{start:.3f}",
                 "-t", f"{end - start:.3f}", "-acodec", "pcm_s16le",
                 "-ar", "16000", "-ac", "1", str(chunk_path)],
                capture_output=True, text=True, timeout=120,
            )
            if result.returncode != 0:
                raise RuntimeError(f"ffmpeg 分段失败: {result.stderr}")
            chunks.append(chunk_path)
            logger.info("分段 %d/%d: %.0fs ~ %.0fs", i + 1, len(splits), start, end)

        return chunks

    def _transcribe_chunk(self, chunk_path: Path) -> str:
        """转写单个音频片段"""
        client = self._get_client()
        with open(chunk_path, "rb") as f:
            response = client.audio.transcriptions.create(
                model=self.model,
                file=(chunk_path.name, f),
            )
        text = getattr(response, "text", None) or ""
        logger.info("转写成功: %s (%d 字符)", chunk_path.name, len(text))
        return text

    def transcribe(self, audio_path: str, language: str | None = "zh") -> list[dict]:
        """
        通过 OpenAI 兼容协议进行语音转写。

        Args:
            audio_path: 音频文件路径
            language: 语言代码（预留，当前模型自动检测）

        Returns:
            list[dict]: [{"text": "完整转写文本..."}]
        """
        audio_path = Path(audio_path)

        if not audio_path.exists():
            raise FileNotFoundError(f"音频文件不存在: {audio_path}")

        if not self.api_key:
            raise ValueError("STT_API_KEY 未配置，无法进行语音转写")

        logger.info("开始转写: %s (model=%s, url=%s)", audio_path, self.model, self.base_url)

        chunk_enabled = get_setting_value_sync("AUDIO_CHUNK_ENABLED", "true").lower() == "true"
        duration = self._get_duration(audio_path)

        if chunk_enabled and duration > CHUNK_DURATION:
            logger.info("音频时长 %.0fs，启用静音切分转写（每段 ≤%ds）", duration, CHUNK_DURATION)
            with tempfile.TemporaryDirectory() as tmpdir:
                chunks = self._split_audio(audio_path, CHUNK_DURATION, Path(tmpdir))
                texts = [self._transcribe_chunk(chunk) for chunk in chunks]
                text = "\n".join(texts)
        else:
            text = self._transcribe_chunk(audio_path)

        text = text.strip()
        if not text:
            logger.warning("转写结果为空")
            return []

        logger.info("转写完成: %d 字符", len(text))
        return [{"text": text}]


_transcriber: Transcriber | None = None


def get_transcriber() -> Transcriber:
    """获取全局 Transcriber 单例。"""
    global _transcriber
    if _transcriber is None:
        _transcriber = Transcriber()
    return _transcriber
