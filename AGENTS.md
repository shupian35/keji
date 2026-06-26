# AGENTS.md

课记 (Course AI Notes) — 将课程视频转换为结构化 Markdown 笔记的全栈应用。

## 项目结构

- `backend/` — Python 3.11+ FastAPI + Celery 异步处理流水线
- `frontend/` — React 18 + TypeScript + Vite + Tailwind CSS
- `docker-compose.yml` — 5 个服务：api, worker, redis, db, frontend
- `docs/adr/` — 架构决策记录

## 命令

### 后端

```bash
cd backend && py -m pip install -r requirements.txt
py -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
celery -A app.tasks.worker worker --loglevel=info --pool=solo
```

**关键**：本地 Celery worker 必须使用 `--pool=solo`，否则多个 worker 可能并发操作同一视频文件。Docker compose 已设置 `--concurrency=1`。

### 前端

```bash
cd frontend && npm install && npm run dev
npm run build   # 运行 tsc -b && vite build
```

### Docker

```bash
docker compose up -d
```

Docker 前端需要预构建的 `frontend/dist/`。先执行：`cd frontend && npm run build`。

## 两个 .env 文件

- **根目录 `.env`** — 从 `.env.example` 复制，供 docker-compose 使用。
- **`backend/.env`** — pydantic-settings 读取的独立文件，后端配置在此。

两者都必须设置 `LLM_API_KEY` 才能生成笔记。

## 架构要点

### 双数据库引擎

代码库同时使用**两个** SQLAlchemy 引擎：
- `AsyncSession` 用于 FastAPI 端点（`database.py:get_db()`）
- `SyncSession` 用于 Celery worker（`SyncSessionLocal()`）

`settings.sync_database_url` 从 `database_url` 自动派生，去除异步驱动。切勿混用——FastAPI 代码必须使用 `await`，Celery 代码使用同步调用。

### Celery 双状态总线

进度同时写入 **Redis**（Celery 结果后端）和**数据库**。`GET /api/tasks/{id}` 优先读 Celery，回退到数据库。Redis 不可用时仍可通过数据库轮询获取进度。

### ID 为 String(36) UUID

非原生数据库 UUID 类型，这是为了 SQLite 兼容性。不要改为 `UUID` 列类型。

### 视频 ID = 任务 ID

MVP 简化设计，视频记录 ID 同时作为 Celery 任务 ID。前端轮询 `GET /api/tasks/{video_id}`。

### 上传优雅降级

上传时若 Celery/Redis 不可达，视频保存为 `status: "pending"`。`/api/videos/{id}/retry` 端点可稍后重新提交。应用在无 worker 运行时仍可上传。

## 语音识别模型

使用 SiliconFlow API（FunAudioLLM/SenseVoiceSmall）进行云端转写。配置项：`SILICONFLOW_API_KEY`、`SILICONFLOW_MODEL`。

## LLM 回退链

`services/llm.py` 有 2 层回退：严格 JSON 模式 → 标准调用。从响应中提取 JSON 支持直接解析、代码块提取、花括号提取三种方式。

## 关键集成点

- **添加流水线步骤**：编辑 `tasks/pipeline.py` 中的 `process_video()`。调用 `_progress(percent, "描述")` 同时更新 Celery 和数据库。
- **添加截图描述**：`video_utils.extract_screenshot()` 已存在。通过 `screenshot_descriptions=` 参数传递给 `generate_notes_sync()`。
- **修改 LLM 配置**：在数据库设置中配置 `LLM_MODEL`、`LLM_API_URL`、`LLM_API_KEY`。任何 OpenAI Chat Completions 兼容 API 均可使用。

## 约束

- 语音识别使用 **SiliconFlow 云端 API**（SenseVoiceSmall），需要 `SILICONFLOW_API_KEY`。
- Celery worker：`--concurrency=1`、`prefetch_multiplier=1`——每次只处理一个视频。
- 无认证/用户系统，CORS 是唯一的访问控制。
- 文件路径存储为绝对路径——API 和 Worker 容器间必须一致（通过 volume 挂载处理）。
- 无测试套件、linter 或 CI 流水线。

## 前端约定

- `@` 别名映射到 `./src`（在 `vite.config.ts` 中配置）。
- Vite 开发服务器将 `/api` 代理到 `http://localhost:8000`。
- 无测试框架或 linter 配置。`npm run build` 运行 `tsc -b && vite build` 可捕获类型错误。
