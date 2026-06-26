# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 概述

课记 (Course AI Notes) — 将课程视频转换为结构化 Markdown 笔记的全栈应用。React 18 + TypeScript + Vite 前端，Python 3.11+ FastAPI 后端，Celery 异步流水线，SiliconFlow SenseVoice 云端语音识别，OpenAI 兼容 LLM 生成笔记。

## 命令

### 后端 (Python)

```bash
# 安装依赖
cd backend && py -m pip install -r requirements.txt

# 启动 FastAPI（默认热重载）
py -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 启动 Celery worker（需要 Redis 在 localhost:6379）
celery -A app.tasks.worker worker --loglevel=info --pool=solo

# API 文档：http://localhost:8000/docs
# 健康检查：http://localhost:8000/api/health
```

### 前端 (Node)

```bash
# 安装 + 开发
cd frontend && npm install && npm run dev

# 生产构建
npm run build
```

### Docker

```bash
docker compose up -d        # 全部 5 个服务 (api, worker, redis, db, frontend)
```

### 配置

在项目根目录将 `.env.example` 复制为 `.env`。LLM 需要设置 `LLM_API_KEY`。后端还会读取独立的 `backend/.env`（pydantic-settings `env_file`）。

## 架构

### 数据流

```
视频上传 → POST /api/videos/upload → FastAPI 保存文件 + 创建数据库记录 → Celery 队列
    → Worker: ffmpeg 提取音频 (16kHz 单声道 WAV)
    → SiliconFlow SenseVoice 转写 (云端 API, FunAudioLLM/SenseVoiceSmall)
    → LLM 生成结构化 JSON {title, markdown_content}
    → 保存 Note 到数据库
    ← 前端轮询 GET /api/tasks/{id} (2秒间隔, 优先 Celery 状态, 回退数据库)
    ← NoteViewer 获取 GET /api/videos/{id}/notes + 通过 GET /api/videos/{id}/media 流式播放视频
```

### 双数据库引擎

**异步**（`AsyncSession`）用于 FastAPI 端点，通过 `get_db()` 依赖注入。
**同步**（`Session`）用于 Celery worker 流水线，通过 `SyncSessionLocal()`。

`settings.sync_database_url` 从 `database_url` 自动派生，去除异步驱动（`+aiosqlite` → `sqlite`，`+asyncpg` → `psycopg2`）。SQLite 使用 `check_same_thread=False`。

所有 ID 为 `String(36)` UUID（非原生数据库 UUID 类型），以兼容 SQLite/PostgreSQL。`segments_json` 列使用 `JSON`（非 `JSONB`）也是出于同样原因。

### Celery 双状态总线

进度同时写入 Celery 结果后端（Redis）和数据库（`self.update_state()` + `_update_video_status()`）。`GET /api/tasks/{id}` 端点优先读 Celery，回退到数据库。Redis 可用时提供实时进度，不可用时优雅降级。

### LLM JSON 可靠性链

笔记生成服务（`services/llm.py`）有两层回退：

1. `response_format={"type": "json_object"}` — 严格 JSON 模式（OpenAI/DeepSeek 兼容）
2. 若 `response_format` 被拒绝则回退到标准调用
3. JSON 提取：直接解析 → 从 ` ```json ``` ` 代码块提取 → 从第一个 `{` 到最后一个 `}` 提取

### 前端笔记展示 (NoteViewer)

纯 Markdown 渲染模式，支持：

- **视频播放器**：进度条可点击跳转，显示当前时间/总时长
- **笔记导出**：下载为 `.md` 文件
- **转写原文**：可折叠面板展示语音转写原文
- **重新生成**：调用 `regenerateNotes` API 重新生成笔记

### 上传 → Celery 优雅降级

上传时若 Celery/Redis 不可达，视频仍以 `status: "pending"` 保存。`/api/videos/{id}/retry` 端点可稍后重新提交。这意味着应用在无 worker 运行时仍可上传。

## 关键集成点

- **添加新流水线步骤**：编辑 `tasks/pipeline.py` 中的 `process_video()`。调用 `_progress(percent, "描述")` 同时更新 Celery 和数据库。
- **添加截图描述**（阶段 3）：`video_utils.extract_screenshot()` 已存在。在流水线中循环，收集描述，通过 `screenshot_descriptions=` 参数传递给 `generate_notes_sync()`。LLM 提示词已支持追加。
- **修改 LLM 模型/配置**：在数据库设置中配置 `LLM_MODEL`、`LLM_API_URL`、`LLM_API_KEY`。任何 OpenAI Chat Completions 兼容 API 均可使用。
- **SiliconFlow 配置**：`STT_API_KEY`（必需），`STT_MODEL=FunAudioLLM/SenseVoiceSmall`。云端 API，无需本地模型。

## 重要约束

- 语音识别使用 **SiliconFlow 云端 API**（SenseVoiceSmall），需要 `STT_API_KEY`。
- 当前范围无关键帧检测、OCR 或说话人分离。
- Celery worker 设置为 `--concurrency=1`，`prefetch_multiplier=1`——每次只处理一个视频。
- 无认证/用户系统，CORS 是唯一的访问控制。
- 文件路径存储为绝对路径——Docker 中 API 和 Worker 容器间必须一致（通过 volume 挂载处理）。
