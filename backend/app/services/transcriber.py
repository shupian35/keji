"""SiliconFlow 语音转写服务封装"""

import json
import logging
import subprocess
from pathlib import Path

from app.config import settings
from app.settings_utils import get_setting_value_sync

logger = logging.getLogger(__name__)


class Transcriber:
    """
    云端语音识别服务（SiliconFlow SenseVoice）。

    使用 SiliconFlow API 进行语音转写，返回完整文本。
    优先使用 curl 调用（兼容性更好），回退到 OpenAI 客户端。

    用法:
        transcriber = Transcriber()
        segments = transcriber.transcribe("audio.wav", language="zh")
        # [{"start": 0.0, "end": 120.0, "text": "完整转写文本..."}]
    """

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or get_setting_value_sync("STT_API_KEY", settings.siliconflow_api_key)

    @property
    def model(self) -> str:
        return get_setting_value_sync("STT_MODEL", settings.siliconflow_model)

    @property
    def base_url(self) -> str:
        return get_setting_value_sync("STT_API_URL", settings.siliconflow_base_url)

    def _transcribe_with_curl(self, audio_path: Path) -> str:
        """使用 curl 调用语音转写 API（兼容性更好）"""
        url = f"{self.base_url}/audio/transcriptions"
        result = subprocess.run(
            [
                "curl", "-s", "-X", "POST", url,
                "-H", f"Authorization: Bearer {self.api_key}",
                "-F", f"model={self.model}",
                "-F", f"file=@{audio_path}",
            ],
            capture_output=True,
            text=True,
            timeout=300,
        )
        if result.returncode != 0:
            raise RuntimeError(f"curl 调用失败: {result.stderr}")

        data = json.loads(result.stdout)
        if "error" in data:
            raise RuntimeError(f"API 错误: {data['error']}")

        return data.get("text", "")

    def _transcribe_with_openai(self, audio_path: Path) -> str:
        """使用 OpenAI 客户端调用语音转写 API"""
        from openai import OpenAI

        client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
        )

        with open(audio_path, "rb") as f:
            response = client.audio.transcriptions.create(
                model=self.model,
                file=(audio_path.name, f),
            )

        return getattr(response, "text", None) or ""

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
            raise ValueError("STT_API_KEY 未配置，无法进行语音转写")

        logger.info("开始转写: %s (model=%s)", audio_path, self.model)

        # 优先使用 curl（SiliconFlow API 对 Python HTTP 客户端有兼容性问题）
        try:
            text = self._transcribe_with_curl(audio_path)
            logger.info("curl 转写成功: %d 字符", len(text))
        except Exception as e:
            logger.warning("curl 转写失败 (%s)，尝试 OpenAI 客户端", e)
            try:
                text = self._transcribe_with_openai(audio_path)
                logger.info("OpenAI 客户端转写成功: %d 字符", len(text))
            except Exception as e2:
                logger.error("OpenAI 客户端也失败: %s", e2)
                raise

        text = text.strip()
        if not text:
            logger.warning("转写结果为空")
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
