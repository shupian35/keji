# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

课记 (Course AI Notes) — full-stack app that converts course videos into structured, timestamped Markdown notes. React 18 + TypeScript + Vite frontend, Python 3.11+ FastAPI backend, Celery async pipeline, SiliconFlow SenseVoice for cloud speech recognition, OpenAI-compatible LLM for note generation.

## Commands

### Backend (Python)

```bash
# Install dependencies
cd backend && py -m pip install -r requirements.txt

# Start FastAPI (hot-reload on by default)
py -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Start Celery worker (requires Redis on localhost:6379)
celery -A app.tasks.worker worker --loglevel=info --pool=solo

# API docs: http://localhost:8000/docs
# Health: http://localhost:8000/api/health
```

### Frontend (Node)

```bash
# Install + dev
cd frontend && npm install && npm run dev

# Build for production
npm run build
```

### Docker

```bash
docker compose up -d        # all 5 services (api, worker, redis, db, frontend)
```

### Configuration

Copy `.env.example` to `.env` in the project root. Required for LLM: set `LLM_API_KEY`. The backend also reads a separate `backend/.env` (pydantic-settings `env_file`).

## Architecture

### Data Flow

```
VideoUpload → POST /api/videos/upload → FastAPI saves file + creates DB record → Celery queue
    → Worker: ffmpeg extract audio (16kHz mono WAV)
    → SiliconFlow SenseVoice transcribe (cloud API, FunAudioLLM/SenseVoiceSmall)
    → LLM generate structured JSON {title, markdown_content, segments: [{start, end, text}]}
    → Save Note to DB
    ← Frontend polls GET /api/tasks/{id} (2s interval, Celery state first, DB fallback)
    ← NoteViewer fetches GET /api/videos/{id}/notes + streams video via GET /api/videos/{id}/media
```

### Dual Database Engine

**Async** (`AsyncSession`) for FastAPI endpoints via `get_db()` dependency injection.  
**Sync** (`Session`) for Celery worker pipeline via `SyncSessionLocal()`.

`settings.sync_database_url` auto-derives from `database_url` by stripping the async driver (`+aiosqlite` → bare `sqlite`, `+asyncpg` → `psycopg2`). Both use `check_same_thread=False` for SQLite.

All IDs are `String(36)` UUIDs (not native DB UUID type) for SQLite/PostgreSQL portability. The `segments_json` column uses `JSON` (not `JSONB`) for the same reason.

### Celery as Dual State Bus

Progress is written to **both** Celery result backend (Redis) and the database simultaneously (`self.update_state()` + `_update_video_status()`). The `GET /api/tasks/{id}` endpoint reads Celery first, falls back to DB. This gives real-time progress when Redis is available, with graceful degradation when it's not.

### LLM JSON Reliability Chain

The note generation service (`services/llm.py`) has four layers of fallback:

1. `response_format={"type": "json_object"}` — strict JSON mode (OpenAI/DeepSeek compatible)
2. Falls back to standard call if `response_format` is rejected
3. JSON extraction: direct parse → from ` ```json ``` ` code block → from first `{` to last `}`
4. **Similarity fallback**: if LLM returns no valid segments, `_match_segments_by_similarity()` splits `markdown_content` by paragraphs, merges transcript into 30s windows, and aligns via `SequenceMatcher` to estimate timestamps

### Frontend Time Sync (NoteViewer)

Segment-based rendering with bidirectional video↔note linkage:

- **Video → Note**: throttled `timeupdate` (250ms) → binary search for `start <= currentTime <= end` → highlight active segment (blue bg + border) + `scrollIntoView({block: "nearest"})`
- **Note → Video**: click segment → `videoRef.current.currentTime = seg.start`
- Falls back to full `content_md` rendering when no segments exist
- Custom `useThrottledCallback` hook for limiting timeupdate handler frequency

### Upload → Celery Graceful Degradation

If Celery/Redis is unreachable at upload time, the video is still saved with `status: "pending"`. The `/api/videos/{id}/retry` endpoint can resubmit it later. This means the app works for upload even without a running worker.

## Key Integration Points

- **Adding a new pipeline step**: edit `process_video()` in `tasks/pipeline.py`. Call `_progress(percent, "description")` to update both Celery and DB.
- **Adding screenshot descriptions** (phase 3): `video_utils.extract_screenshot()` exists. Loop in pipeline, collect descriptions, pass to `generate_notes_sync()` via `screenshot_descriptions=` parameter. LLM prompt already supports appending them.
- **LLM model/config change**: set `LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY` in `.env`. Any OpenAI Chat Completions-compatible API works.
- **SiliconFlow config**: `SILICONFLOW_API_KEY` (required), `SILICONFLOW_MODEL=FunAudioLLM/SenseVoiceSmall`. Cloud API, no local model needed.

## Important Constraints

- Speech recognition uses **SiliconFlow cloud API** (SenseVoiceSmall). Requires `SILICONFLOW_API_KEY`.
- No keyframe detection, OCR, or speaker diarization in current scope.
- Celery worker set to `--concurrency=1` with `prefetch_multiplier=1` — processes one video at a time.
- No authentication/user system. CORS is the only access control.
- File paths stored as absolute paths — must be consistent between API and Worker containers in Docker (volume mounts handle this).
