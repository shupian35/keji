"""应用配置 — 使用 pydantic-settings 从环境变量读取"""

from pathlib import Path
from functools import cached_property

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- 数据库 ---
    database_url: str = "sqlite+aiosqlite:///./keji.db"

    # --- Redis ---
    redis_url: str = "redis://localhost:6379/0"

    # --- LLM ---
    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o"

    # --- SiliconFlow 语音转写 ---
    siliconflow_api_key: str = ""
    siliconflow_model: str = "FunAudioLLM/SenseVoiceSmall"
    siliconflow_base_url: str = "https://api.siliconflow.cn/v1"

    # --- 文件存储 ---
    upload_dir: str = "./uploads"
    media_dir: str = "./media"

    # --- CORS ---
    cors_origins: list[str] = ["http://localhost:5173", "http://192.168.31.58:5173"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @cached_property
    def sync_database_url(self) -> str:
        """返回同步版本的数据库 URL（Celery worker 使用）。

        对于 aiosqlite → sqlite，对于 asyncpg → psycopg2。
        """
        url = self.database_url
        if "+aiosqlite" in url:
            url = url.replace("+aiosqlite", "")
        elif "+asyncpg" in url:
            url = url.replace("+asyncpg", "").replace("asyncpg", "psycopg2")
        return url

    def get_upload_path(self) -> Path:
        p = Path(self.upload_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p

    def get_media_path(self) -> Path:
        p = Path(self.media_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p


settings = Settings()
