"""Pydantic 请求/响应模型"""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


# ─── 枚举 ──────────────────────────────────────────────

class VideoStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    done = "done"
    failed = "failed"


# ─── 语音转写片段 ───────────────────────────────────────

class SegmentOut(BaseModel):
    """单个笔记段落（带时间戳）"""
    start: float = Field(..., description="开始时间（秒）")
    end: float = Field(..., description="结束时间（秒）")
    text: str = Field(..., description="段落 Markdown 文本")


class TranscriptSegment(BaseModel):
    """语音转写原始片段"""
    start: float
    end: float
    text: str


# ─── 任务状态 ──────────────────────────────────────────

class TaskResponse(BaseModel):
    task_id: str = Field(..., description="任务 UUID")
    status: VideoStatus
    progress: float = Field(0.0, ge=0.0, le=1.0)
    video_id: str | None = None
    step: str | None = None
    error: str | None = None


# ─── 视频 ──────────────────────────────────────────────

class VideoResponse(BaseModel):
    id: str
    filename: str
    status: VideoStatus
    progress: float = 0.0
    created_at: datetime | None = None


# ─── 笔记 ──────────────────────────────────────────────

class NoteResponse(BaseModel):
    video_id: str
    filename: str
    note_id: str
    content_md: str
    segments: list[SegmentOut] = []
    transcript: list[SegmentOut] = []


# ─── LLM 返回的内部结构 ─────────────────────────────────

class LLMNoteResult(BaseModel):
    """LLM 返回的笔记 JSON 结构"""
    title: str = ""
    markdown_content: str = ""
    segments: list[SegmentOut] = []


# ─── 通用消息 ──────────────────────────────────────────

class MessageResponse(BaseModel):
    message: str
