"""设置配置模型"""

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.models.task import Base


class Settings(Base):
    """系统设置表"""
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=True)
    description = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<Settings(key={self.key}, value={self.value[:20] if self.value else None}...)>"
