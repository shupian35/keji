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
