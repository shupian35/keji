"""设置工具函数 — 优先从数据库读取，回退到环境变量"""

import logging
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settings import Settings

logger = logging.getLogger(__name__)


async def get_setting_value(db: AsyncSession, key: str, default: str = "") -> str:
    """从数据库获取设置值，如果不存在则返回默认值"""
    try:
        result = await db.execute(select(Settings).where(Settings.key == key))
        setting = result.scalar_one_or_none()
        if setting and setting.value and setting.value.strip():
            return setting.value
    except Exception as e:
        logger.warning("从数据库读取设置 %s 失败: %s", key, e)
    return default


def get_setting_value_sync(key: str, default: str = "") -> str:
    """同步版本：从数据库获取设置值（供 Celery worker 使用）"""
    try:
        from app.database import SyncSessionLocal
        from app.models.settings import Settings as SettingsModel

        db = SyncSessionLocal()
        try:
            setting = db.query(SettingsModel).filter(SettingsModel.key == key).first()
            if setting and setting.value and setting.value.strip():
                return setting.value
        finally:
            db.close()
    except Exception as e:
        logger.warning("从数据库读取设置 %s 失败: %s", key, e)
    return default


def get_ai_config() -> dict:
    """获取AI配置，优先从数据库读取，回退到环境变量"""
    from app.config import settings

    # 同步版本，供 Celery worker 使用
    llm_api_key = get_setting_value_sync("LLM_API_KEY", settings.llm_api_key)
    llm_base_url = get_setting_value_sync("LLM_API_URL", settings.llm_base_url)
    llm_model = get_setting_value_sync("LLM_MODEL", settings.llm_model)

    siliconflow_api_key = get_setting_value_sync("STT_API_KEY", settings.siliconflow_api_key)
    siliconflow_model = get_setting_value_sync("STT_MODEL", settings.siliconflow_model)
    siliconflow_base_url = get_setting_value_sync("STT_API_URL", settings.siliconflow_base_url)

    return {
        "llm_api_key": llm_api_key,
        "llm_base_url": llm_base_url,
        "llm_model": llm_model,
        "siliconflow_api_key": siliconflow_api_key,
        "siliconflow_model": siliconflow_model,
        "siliconflow_base_url": siliconflow_base_url,
    }
