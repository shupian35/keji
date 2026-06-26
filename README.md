# 课记 (Course AI Notes)

将课程视频自动转化为结构化学习笔记的全栈应用。

## 功能

- 📤 视频上传（或粘贴链接）
- 🎙️ 云端语音识别（SiliconFlow SenseVoice，支持中英文）
- 🤖 大模型生成结构化 Markdown 笔记（含时间戳关联）
- 🎬 笔记与视频播放时间联动（点击跳转、播放高亮）
- 📥 笔记导出（Markdown / PDF）

## 技术栈

| 模块   | 方案                         |
| ------ | ---------------------------- |
| 前端   | React + TypeScript + Vite + Tailwind CSS |
| 后端   | Python 3.11+ + FastAPI + Celery |
| 语音转写 | SiliconFlow SenseVoice (云端) |
| 笔记生成 | DeepSeek / OpenAI 兼容 API |
| 视频处理 | ffmpeg                      |
| 数据库 | PostgreSQL (开发可用 SQLite) |
| 部署   | Docker + Docker Compose      |

## 快速开始

### 前置要求

- Python 3.11+
- Node.js 18+
- ffmpeg
- Redis (或使用 Docker)
- Docker & Docker Compose (可选)

### 1. 环境配置

```bash
cp .env.example .env
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入以下必要配置：
#   LLM_API_KEY        — 大模型 API 密钥（DeepSeek / OpenAI 兼容）
#   SILICONFLOW_API_KEY — SiliconFlow 语音识别 API 密钥
```

### 2. Docker 部署（推荐）

```bash
docker compose up -d
```

### 3. 本地开发

**后端：**

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

**前端：**

```bash
cd frontend
npm install
npm run dev
```

**Celery Worker（另开终端）：**

```bash
cd backend
celery -A app.tasks.worker worker --loglevel=info --pool=solo
```

### 4. 访问

- 前端：http://localhost:5173
- 后端 API 文档：http://localhost:8000/docs

## 项目结构

```
keji/
├── backend/           # FastAPI 后端
│   └── app/
│       ├── main.py    # 应用入口
│       ├── config.py  # 配置
│       ├── models/    # 数据库模型
│       ├── api/       # API 路由
│       ├── tasks/     # Celery 异步任务
│       └── services/  # 业务服务
├── frontend/          # React 前端
│   └── src/
│       ├── pages/     # 页面组件
│       ├── components/# 通用组件
│       ├── api/       # API 客户端
│       └── types/     # TypeScript 类型
├── docker-compose.yml
└── .env.example
```

## 开发路线

- [x] 阶段一：项目骨架搭建
- [x] 阶段二：MVP — 上传 → 转写 → 生成笔记
- [x] 阶段三：时间轴联动（点击跳转、播放高亮）
- [ ] 阶段四：可选增强（画面描述、PDF 导出）

## License

MIT
