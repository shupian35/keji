from app.models.task import Video, Note
from app.models.settings import Settings

__all__ = ["Video", "Note", "Settings"]
"""数据库模型"""

from app.models.task import Base, Video, Note  # noqa: F401
