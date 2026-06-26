"""SQLAlchemy 模型：Video / Note。

使用通用类型（String UUID / JSON），兼容 SQLite 和 PostgreSQL。
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    audio_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )
    progress: Mapped[float] = mapped_column(default=0.0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # 关联笔记
    note: Mapped["Note | None"] = relationship(
        "Note", back_populates="video", uselist=False, cascade="all, delete-orphan"
    )

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "filename": self.filename,
            "file_path": self.file_path,
            "audio_path": self.audio_path,
            "status": self.status,
            "progress": self.progress,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    video_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    content_md: Mapped[str] = mapped_column(Text, nullable=False, default="")
    segments_json: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    transcript_json: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # 关联视频
    video: Mapped["Video"] = relationship("Video", back_populates="note")

    def get_segments(self) -> list[dict]:
        """反序列化 segments_json，确保返回列表。"""
        data = self.segments_json or {}
        if isinstance(data, dict):
            return data.get("segments", [])
        return data if isinstance(data, list) else []

    def get_transcript(self) -> list[dict]:
        """获取原始转写文本列表。"""
        data = self.transcript_json or {}
        if isinstance(data, dict):
            return data.get("segments", [])
        return data if isinstance(data, list) else []

    def set_transcript(self, transcript: list[dict]):
        """序列化并存储转写文本。"""
        self.transcript_json = transcript

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "video_id": str(self.video_id),
            "content_md": self.content_md,
            "segments": self.get_segments(),
            "transcript": self.get_transcript(),
            "created_at": self.created_at,
        }
