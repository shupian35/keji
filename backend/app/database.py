"""数据库引擎与会话管理。

提供异步（FastAPI）和同步（Celery）两套引擎。
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

# ─── 异步引擎（FastAPI） ────────────────────────────────

async_engine = create_async_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
)

AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# ─── 同步引擎（Celery Worker） ───────────────────────────

sync_engine = create_engine(
    settings.sync_database_url,
    echo=False,
    connect_args={"check_same_thread": False} if "sqlite" in settings.sync_database_url else {},
    pool_pre_ping=True,
)

SyncSessionLocal = sessionmaker(
    sync_engine,
    class_=Session,
    expire_on_commit=False,
)


# ─── FastAPI 依赖注入 ───────────────────────────────────

async def get_db():
    """FastAPI 依赖：获取异步数据库会话。"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ─── 初始化数据库表 ─────────────────────────────────────

async def init_db():
    """创建所有数据库表（异步）。"""
    from app.models.task import Base
    import app.models.settings  # noqa: F401 — 注册 Settings 到 Base.metadata

    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


def init_db_sync():
    """创建所有数据库表（同步，供 Celery worker 使用）。"""
    from app.models.task import Base
    import app.models.settings  # noqa: F401 — 注册 Settings 到 Base.metadata

    Base.metadata.create_all(bind=sync_engine)
