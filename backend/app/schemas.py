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


# ─── 任务状态 ──────────────────────────────────────────

class TaskResponse(BaseModel):
    task_id: str = Field(..., description="任务 UUID")
    status: VideoStatus
    progress: float = Field(0.0, ge=0.0, le=1.0)
    video_id: str | None = None
    filename: str | None = None
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


# ─── LLM 返回的内部结构 ─────────────────────────────────

class LLMNoteResult(BaseModel):
    """LLM 返回的笔记 JSON 结构"""
    title: str = ""
    markdown_content: str = ""


# ─── 批量下载 ──────────────────────────────────────────

class BatchDownloadRequest(BaseModel):
    video_ids: list[str] = Field(..., min_length=1, description="视频ID列表，至少一个")


# ─── 通用消息 ──────────────────────────────────────────

class MessageResponse(BaseModel):
    message: str
