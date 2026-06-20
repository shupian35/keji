"""SiliconFlow 语音转写服务封装"""

import logging
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)


class Transcriber:
    """
    云端语音识别服务（SiliconFlow SenseVoice）。

    使用 SiliconFlow API 进行语音转写，返回完整文本。

    用法:
        transcriber = Transcriber()
        segments = transcriber.transcribe("audio.wav", language="zh")
        # [{"start": 0.0, "end": 120.0, "text": "完整转写文本..."}]
    """

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.siliconflow_api_key

    @property
    def model(self) -> str:
        return settings.siliconflow_model

    @property
    def base_url(self) -> str:
        return settings.siliconflow_base_url

    def transcribe(
        self, audio_path: str, language: str | None = "zh", duration: float | None = None
    ) -> list[dict]:
        """
        通过 SiliconFlow API 进行语音转写。

        Args:
            audio_path: 音频文件路径
            language: 语言代码（预留，当前模型自动检测）
            duration: 音频总时长（秒），用于生成时间戳区间

        Returns:
            list[dict]: 转写片段，每个包含 start, end, text 字段
                [{"start": 0.0, "end": 120.0, "text": "完整转写文本..."}]
        """
        audio_path = Path(audio_path)

        if not audio_path.exists():
            raise FileNotFoundError(f"音频文件不存在: {audio_path}")

        if not self.api_key:
            raise ValueError("SILICONFLOW_API_KEY 未配置，无法进行语音转写")

        logger.info("开始转写: %s (model=%s)", audio_path, self.model)

        from openai import OpenAI

        client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
        )

        with open(audio_path, "rb") as f:
            logger.info("上传文件: %s (size=%d bytes)", audio_path.name, audio_path.stat().st_size)
            response = client.audio.transcriptions.create(
                model=self.model,
                file=(audio_path.name, f),
            )
            logger.info("API 响应: %s", response)

        text = getattr(response, "text", None) or ""
        text = text.strip()
        if not text:
            logger.warning("转写结果为空: response=%s", response)
            return []

        logger.info("转写完成: %d 字符", len(text))

        end_time = duration if duration else max(len(text) * 0.08, 1.0)
        return [{"start": 0.0, "end": round(end_time, 2), "text": text}]


_transcriber: Transcriber | None = None


def get_transcriber() -> Transcriber:
    """获取全局 Transcriber 单例。"""
    global _transcriber
    if _transcriber is None:
        _transcriber = Transcriber()
    return _transcriber
