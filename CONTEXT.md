# CONTEXT — 课记 (Course AI Notes)

## 术语表

### 视频 (Video)
用户上传的源视频文件。存储在磁盘上，由 `videos` 数据库记录引用。处理生命周期：`pending → processing → done | failed`。一个视频最多生成一条笔记。MVP 中视频 ID 同时作为任务 ID。

### 笔记 (Note)
由视频 AI 生成的结构化课程笔记。包含完整 Markdown（`content_md`）和原始转写文本。始终只关联一个视频。`content_md` 用于导出/下载。

### 转写片段 (Transcript Segment)
来自 SiliconFlow SenseVoice API 的原始语音识别片段。包含 `text`（纯文本）。转写片段是 LLM 的输入，LLM 将其精炼为笔记内容。在可折叠的「语音转写原文」面板中展示。

### 处理流水线 (Processing Pipeline)
将视频转换为笔记的 Celery 异步工作流：提取音频（ffmpeg）→ 转写（SiliconFlow SenseVoice）→ 生成笔记（LLM）→ 持久化。进度通过 Celery 任务状态（Redis）和视频数据库记录报告。瞬态故障（网络、限流）最多重试 3 次（指数退避）；永久性故障（认证、文件损坏）立即失败。

### 上传 (Upload)
提交视频文件进行处理。返回任务 ID（与视频 ID 相同）。上传时若 Celery worker 不可达，视频以 `pending` 状态保存，前端显示处理服务不可用的警告。

### 导出 (Export)
将笔记下载为独立 Markdown 文件（`.md`）。直接使用 `content_md`——导出文件无时间戳。PDF 导出延后到后续阶段。
