"""FastAPI 应用入口"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.settings import router as settings_router
from app.api.video import router as video_router
from app.config import settings
from app.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期 — 创建必要目录 + 初始化数据库表"""
    settings.get_upload_path()
    settings.get_media_path()

    # 自动建表（开发方便；生产建议用 Alembic 迁移）
    await init_db()

    yield


app = FastAPI(
    title="课记 API",
    description="课程 AI 笔记应用后端 — 视频上传、语音转写、笔记生成",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(video_router, prefix="/api")
app.include_router(settings_router, prefix="/api")


@app.get("/api/health")
async def health_check():
    """健康检查"""
    return {"status": "ok", "version": "0.1.0"}
