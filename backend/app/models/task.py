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
        String(36), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False
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

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "video_id": str(self.video_id),
            "content_md": self.content_md,
            "segments": self.get_segments(),
            "transcript": self.get_transcript(),
            "created_at": self.created_at,
        }
"""视频和笔记的 SQLAlchemy 模型"""

import json
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Video(Base):
    __tablename__ = "videos"

    id = Column(String(36), primary_key=True)
    filename = Column(String(512), nullable=False)
    file_path = Column(String(1024), nullable=False)
    audio_path = Column(String(1024), nullable=True)
    status = Column(String(20), nullable=False, default="pending")
    progress = Column(Float, nullable=False, default=0.0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    note = relationship("Note", back_populates="video", uselist=False)


class Note(Base):
    __tablename__ = "notes"

    id = Column(String(36), primary_key=True)
    video_id = Column(String(36), ForeignKey("videos.id"), nullable=False, unique=True)
    content_md = Column(Text, nullable=False, default="")
    segments_json = Column(Text, nullable=False, default="[]")
    transcript_json = Column(Text, nullable=False, default="[]")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    video = relationship("Video", back_populates="note")

    def get_segments(self) -> list[dict]:
        if isinstance(self.segments_json, str):
            return json.loads(self.segments_json) if self.segments_json else []
        if isinstance(self.segments_json, list):
            return self.segments_json
        return []

    def set_segments(self, segments: list[dict]):
        self.segments_json = json.dumps(segments, ensure_ascii=False)

    def get_transcript(self) -> list[dict]:
        if isinstance(self.transcript_json, str):
            return json.loads(self.transcript_json) if self.transcript_json else []
        if isinstance(self.transcript_json, list):
            return self.transcript_json
        return []

    def set_transcript(self, transcript: list[dict]):
        self.transcript_json = json.dumps(transcript, ensure_ascii=False)
