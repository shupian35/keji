import io
import json
import zipfile

import pytest
import pytest_asyncio
from httpx import AsyncClient

from tests.conftest import create_note, create_video


@pytest.mark.asyncio
async def test_batch_download_success(client: AsyncClient, db):
    v1 = await create_video(db, filename="lecture1.mp4")
    v2 = await create_video(db, filename="lecture2.mp4")
    await create_note(db, v1.id, content_md="# Lecture 1 Notes", transcript=[{"start": 0.0, "end": 3.0, "text": "Hello"}])
    await create_note(db, v2.id, content_md="# Lecture 2 Notes", transcript=[{"start": 0.0, "end": 4.0, "text": "World"}])

    resp = await client.post("/api/videos/batch-download", json={"video_ids": [v1.id, v2.id]})
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"

    zip_buffer = io.BytesIO(resp.content)
    with zipfile.ZipFile(zip_buffer) as zf:
        names = zf.namelist()
        assert "lecture1.md" in names
        assert "lecture1.txt" in names
        assert "lecture2.md" in names
        assert "lecture2.txt" in names
        assert zf.read("lecture1.md") == b"# Lecture 1 Notes"
        assert zf.read("lecture2.md") == b"# Lecture 2 Notes"
        transcript1 = zf.read("lecture1.txt").decode()
        assert "Hello" in transcript1
        assert "[0.00s - 3.00s]" in transcript1


@pytest.mark.asyncio
async def test_batch_download_single_video(client: AsyncClient, db):
    v = await create_video(db, filename="single.mp4")
    await create_note(db, v.id, content_md="# Single")

    resp = await client.post("/api/videos/batch-download", json={"video_ids": [v.id]})
    assert resp.status_code == 200

    zip_buffer = io.BytesIO(resp.content)
    with zipfile.ZipFile(zip_buffer) as zf:
        assert len(zf.namelist()) == 2
        assert "single.md" in zf.namelist()


@pytest.mark.asyncio
async def test_batch_download_empty_list(client: AsyncClient):
    resp = await client.post("/api/videos/batch-download", json={"video_ids": []})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_batch_download_missing_video(client: AsyncClient):
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.post("/api/videos/batch-download", json={"video_ids": [fake_id]})
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower() or "not found" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_batch_download_invalid_uuid(client: AsyncClient):
    resp = await client.post("/api/videos/batch-download", json={"video_ids": ["not-a-uuid"]})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_batch_download_non_completed_video(client: AsyncClient, db):
    v = await create_video(db, status="processing", filename="processing.mp4")
    await create_note(db, v.id)

    resp = await client.post("/api/videos/batch-download", json={"video_ids": [v.id]})
    assert resp.status_code == 400
    assert "not completed" in resp.json()["detail"].lower() or "未完成" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_batch_download_pending_video(client: AsyncClient, db):
    v = await create_video(db, status="pending", filename="pending.mp4")
    await create_note(db, v.id)

    resp = await client.post("/api/videos/batch-download", json={"video_ids": [v.id]})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_batch_download_failed_video(client: AsyncClient, db):
    v = await create_video(db, status="failed", filename="failed.mp4")
    await create_note(db, v.id)

    resp = await client.post("/api/videos/batch-download", json={"video_ids": [v.id]})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_batch_download_deduplicates_ids(client: AsyncClient, db):
    v = await create_video(db, filename="dup.mp4")
    await create_note(db, v.id, content_md="# Dup")

    resp = await client.post("/api/videos/batch-download", json={"video_ids": [v.id, v.id, v.id]})
    assert resp.status_code == 200

    zip_buffer = io.BytesIO(resp.content)
    with zipfile.ZipFile(zip_buffer) as zf:
        md_files = [n for n in zf.namelist() if n.endswith(".md")]
        assert len(md_files) == 1


@pytest.mark.asyncio
async def test_batch_download_exceeds_max_limit(client: AsyncClient, db):
    ids = [str(__import__("uuid").uuid4()) for _ in range(51)]
    resp = await client.post("/api/videos/batch-download", json={"video_ids": ids})
    assert resp.status_code == 400
    assert "50" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_batch_download_video_without_note(client: AsyncClient, db):
    v = await create_video(db, filename="nonote.mp4")

    resp = await client.post("/api/videos/batch-download", json={"video_ids": [v.id]})
    assert resp.status_code == 200

    zip_buffer = io.BytesIO(resp.content)
    with zipfile.ZipFile(zip_buffer) as zf:
        assert len(zf.namelist()) == 0


@pytest.mark.asyncio
async def test_batch_download_transcript_format(client: AsyncClient, db):
    v = await create_video(db, filename="format.mp4")
    transcript = [
        {"start": 1.23, "end": 5.67, "text": "First segment"},
        {"start": 6.0, "end": 10.5, "text": "Second segment"},
    ]
    await create_note(db, v.id, content_md="# Format Test", transcript=transcript)

    resp = await client.post("/api/videos/batch-download", json={"video_ids": [v.id]})
    assert resp.status_code == 200

    zip_buffer = io.BytesIO(resp.content)
    with zipfile.ZipFile(zip_buffer) as zf:
        txt = zf.read("format.txt").decode()
        assert "[1.23s - 5.67s] First segment" in txt
        assert "[6.00s - 10.50s] Second segment" in txt
