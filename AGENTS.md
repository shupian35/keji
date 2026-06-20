# AGENTS.md

课记 (Course AI Notes) — full-stack app that converts course videos into structured, timestamped Markdown notes.

## Project layout

- `backend/` — Python 3.11+ FastAPI + Celery async pipeline
- `frontend/` — React 18 + TypeScript + Vite + Tailwind CSS
- `docker-compose.yml` — 5 services: api, worker, redis, db, frontend
- `docs/adr/` — Architecture Decision Records

## Commands

### Backend

```bash
cd backend && py -m pip install -r requirements.txt
py -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
celery -A app.tasks.worker worker --loglevel=info --pool=solo
```

**Critical**: Celery worker MUST use `--pool=solo` locally. Without it, concurrent workers may race on the same video file. Docker compose already sets `--concurrency=1`.

### Frontend

```bash
cd frontend && npm install && npm run dev
npm run build   # runs tsc -b && vite build
```

### Docker

```bash
docker compose up -d
```

Docker frontend expects pre-built `frontend/dist/`. Build first: `cd frontend && npm run build`.

## Two .env files

- **Root `.env`** — copied from `.env.example`. Used by docker-compose.
- **`backend/.env`** — separate file read by pydantic-settings. Backend config lives here.

Both must have `LLM_API_KEY` set for note generation to work.

## Architecture gotchas

### Dual database engine

The codebase uses **two** SQLAlchemy engines simultaneously:
- `AsyncSession` for FastAPI endpoints (`database.py:get_db()`)
- `SyncSession` for Celery worker (`SyncSessionLocal()`)

`settings.sync_database_url` auto-derives from `database_url` by stripping the async driver. Never mix them — FastAPI code must use `await`, Celery code uses synchronous calls.

### Celery dual state bus

Progress is written to **both** Redis (Celery result backend) and the database. `GET /api/tasks/{id}` reads Celery first, falls back to DB. If Redis is down, progress still works via DB polling.

### IDs are String(36) UUIDs

Not native DB UUID type. This is intentional for SQLite portability. Don't change to `UUID` column type.

### Video ID = Task ID

For simplicity in MVP, the video record ID doubles as the Celery task ID. The frontend polls `GET /api/tasks/{video_id}`.

### Upload graceful degradation

If Celery/Redis is unreachable at upload time, video is saved as `status: "pending"`. The `/api/videos/{id}/retry` endpoint resubmits later. The app works for upload without a running worker.

## Whisper model

Uses SiliconFlow API (FunAudioLLM/SenseVoiceSmall) for cloud transcription. Config via env: `SILICONFLOW_API_KEY`, `SILICONFLOW_MODEL`.

## LLM fallback chain

`services/llm.py` has 4 layers: strict JSON mode → standard call → regex extraction from response → similarity-based segment alignment. If the LLM returns no valid segments, a `SequenceMatcher` heuristic splits `markdown_content` by paragraphs and aligns to transcript timestamps.

## Key integration points

- **Adding a pipeline step**: edit `process_video()` in `tasks/pipeline.py`. Call `_progress(percent, "description")` to update both Celery and DB.
- **Adding screenshot descriptions**: `video_utils.extract_screenshot()` exists. Pass to `generate_notes_sync()` via `screenshot_descriptions=` parameter.
- **LLM config change**: set `LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY` in `.env`. Any OpenAI Chat Completions-compatible API works.

## Constraints

- Speech recognition uses **SiliconFlow cloud API** (SenseVoiceSmall). Requires `SILICONFLOW_API_KEY`.
- Celery worker: `--concurrency=1`, `prefetch_multiplier=1` — one video at a time.
- No auth/user system. CORS is the only access control.
- File paths stored as absolute paths — must be consistent between API and Worker containers (volume mounts handle this).
- No test suite, linter, or CI pipeline exists yet.

## Frontend conventions

- `@` alias maps to `./src` (configured in `vite.config.ts`).
- Vite dev server proxies `/api` to `http://localhost:8000`.
- No test framework or linting is configured. `npm run build` runs `tsc -b && vite build` which catches type errors.
