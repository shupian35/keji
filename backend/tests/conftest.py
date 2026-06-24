import asyncio
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import get_db
from app.main import app
from app.models.task import Base, Note, Video

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"
test_engine = create_async_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


async def override_get_db():
    async with TestSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def db():
    async with TestSessionLocal() as session:
        yield session


async def create_video(db: AsyncSession, status="done", filename="test.mp4") -> Video:
    video = Video(
        id=str(uuid.uuid4()),
        filename=filename,
        file_path=f"/tmp/{filename}",
        status=status,
        progress=1.0 if status == "done" else 0.0,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)
    return video


async def create_note(db: AsyncSession, video_id: str, content_md="# Test Note", transcript=None) -> Note:
    import json
    if transcript is None:
        transcript = [{"start": 0.0, "end": 5.0, "text": "Hello world"}]
    note = Note(
        id=str(uuid.uuid4()),
        video_id=video_id,
        content_md=content_md,
        transcript_json=json.dumps(transcript),
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note
