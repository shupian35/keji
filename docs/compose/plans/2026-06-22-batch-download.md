# 批量下载笔记和原文功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在上传记录页面添加批量下载笔记和原文的功能，用户可以选择多个视频，下载包含笔记和原文的ZIP文件。

**Architecture:** 前端添加复选框选择和全选功能，后端新增批量下载API端点，生成包含所有选中视频笔记和原文的ZIP文件。

**Tech Stack:** React, TypeScript, FastAPI, Python zipfile

---

## 文件结构

### 前端文件
- **修改**: `frontend/src/pages/VideoListPage.tsx` — 添加选择界面和下载按钮
- **修改**: `frontend/src/api/client.ts` — 添加批量下载API函数
- **修改**: `frontend/src/types/index.ts` — 添加批量下载请求类型

### 后端文件
- **修改**: `backend/app/api/video.py` — 添加批量下载API端点
- **修改**: `backend/app/schemas.py` — 添加批量下载请求模型

---

## Task 1: 后端 - 添加批量下载请求模型

**Covers:** [S4, S5]

**Files:**
- Modify: `backend/app/schemas.py`

- [ ] **Step 1: 添加批量下载请求模型**

在 `backend/app/schemas.py` 文件中添加批量下载请求模型：

```python
class BatchDownloadRequest(BaseModel):
    video_ids: List[str]
```

- [ ] **Step 2: 验证模型定义正确**

运行: `cd backend && python -c "from app.schemas import BatchDownloadRequest; print('Model imported successfully')"`

Expected: Model imported successfully

---

## Task 2: 后端 - 实现批量下载API端点

**Covers:** [S4, S6, S10]

**Files:**
- Modify: `backend/app/api/video.py`

- [ ] **Step 1: 添加批量下载API端点**

在 `backend/app/api/video.py` 文件中添加批量下载API端点：

```python
from fastapi.responses import StreamingResponse
import zipfile
import io
from datetime import datetime

@router.post("/videos/batch-download")
async def batch_download_videos(request: BatchDownloadRequest, db: AsyncSession = Depends(get_db)):
    # 验证请求参数
    if not request.video_ids:
        raise HTTPException(status_code=400, detail="No video IDs provided")
    
    if len(request.video_ids) > 50:
        raise HTTPException(status_code=400, detail="Too many videos requested (max 50)")
    
    # 从数据库获取视频信息
    result = await db.execute(
        select(Video).where(Video.id.in_(request.video_ids))
    )
    videos = result.scalars().all()
    
    # 验证视频存在
    if len(videos) != len(request.video_ids):
        found_ids = {v.id for v in videos}
        missing_ids = set(request.video_ids) - found_ids
        raise HTTPException(status_code=404, detail=f"Videos not found: {missing_ids}")
    
    # 验证视频状态
    non_completed = [v for v in videos if v.status != "done"]
    if non_completed:
        raise HTTPException(
            status_code=400, 
            detail=f"Videos not completed: {[v.id for v in non_completed]}"
        )
    
    # 获取笔记内容
    notes_result = await db.execute(
        select(Note).where(Note.video_id.in_(request.video_ids))
    )
    notes = notes_result.scalars().all()
    notes_by_video = {n.video_id: n for n in notes}
    
    # 生成ZIP文件
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for video in videos:
            note = notes_by_video.get(video.id)
            if note:
                # 添加笔记文件
                note_filename = f"{video.filename}.md"
                zip_file.writestr(note_filename, note.content_md)
                
                # 添加原文文件
                transcript_filename = f"{video.filename}.txt"
                transcript_content = "\n".join(
                    f"[{segment.start:.2f}s - {segment.end:.2f}s] {segment.text}"
                    for segment in note.transcript
                )
                zip_file.writestr(transcript_filename, transcript_content)
    
    # 准备下载
    zip_buffer.seek(0)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"batch_download_{timestamp}.zip"
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
```

- [ ] **Step 2: 验证API端点定义正确**

运行: `cd backend && python -c "from app.api.video import router; print('Router imported successfully')"`

Expected: Router imported successfully

---

## Task 3: 前端 - 添加批量下载请求类型

**Covers:** [S5]

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: 添加批量下载请求类型**

在 `frontend/src/types/index.ts` 文件中添加批量下载请求类型：

```typescript
export interface BatchDownloadRequest {
  video_ids: string[];
}
```

---

## Task 4: 前端 - 添加批量下载API函数

**Covers:** [S4]

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: 添加批量下载API函数**

在 `frontend/src/api/client.ts` 文件中添加批量下载API函数：

```typescript
export async function batchDownloadVideos(videoIds: string[]): Promise<Blob> {
  const response = await api.post('/videos/batch-download', { video_ids: videoIds }, {
    responseType: 'blob'
  });
  return response.data;
}
```

---

## Task 5: 前端 - 实现选择界面和下载功能

**Covers:** [S3, S6]

**Files:**
- Modify: `frontend/src/pages/VideoListPage.tsx`

- [ ] **Step 1: 添加状态管理**

在 `VideoListPage` 组件中添加状态管理：

```typescript
const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
const [isDownloading, setIsDownloading] = useState(false);
```

- [ ] **Step 2: 添加选择逻辑函数**

添加选择逻辑函数：

```typescript
const handleSelectVideo = (videoId: string) => {
  setSelectedVideos(prev => {
    const newSet = new Set(prev);
    if (newSet.has(videoId)) {
      newSet.delete(videoId);
    } else {
      newSet.add(videoId);
    }
    return newSet;
  });
};

const handleSelectAll = () => {
  if (selectedVideos.size === videos.length) {
    setSelectedVideos(new Set());
  } else {
    setSelectedVideos(new Set(videos.map(v => v.id)));
  }
};
```

- [ ] **Step 3: 添加下载功能函数**

添加下载功能函数：

```typescript
const handleBatchDownload = async () => {
  if (selectedVideos.size === 0) return;
  
  setIsDownloading(true);
  try {
    const blob = await batchDownloadVideos(Array.from(selectedVideos));
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch_download_${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    // 显示成功提示
    alert('下载完成！');
  } catch (error) {
    console.error('下载失败:', error);
    alert('下载失败，请重试');
  } finally {
    setIsDownloading(false);
  }
};
```

- [ ] **Step 4: 添加全选复选框和下载按钮**

在页面顶部添加全选复选框和下载按钮：

```typescript
<div className="flex items-center justify-between mb-4">
  <div className="flex items-center space-x-4">
    <label className="flex items-center space-x-2">
      <input
        type="checkbox"
        checked={selectedVideos.size === videos.length && videos.length > 0}
        onChange={handleSelectAll}
        className="rounded"
      />
      <span>全选</span>
    </label>
    {selectedVideos.size > 0 && (
      <span className="text-sm text-gray-500">
        已选择 {selectedVideos.size} 个视频
      </span>
    )}
  </div>
  
  <button
    onClick={handleBatchDownload}
    disabled={selectedVideos.size === 0 || isDownloading}
    className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
  >
    {isDownloading ? '下载中...' : `下载笔记和原文 (${selectedVideos.size})`}
  </button>
</div>
```

- [ ] **Step 5: 在视频列表项中添加复选框**

在每个视频项前添加复选框：

```typescript
<div className="flex items-center space-x-4">
  <input
    type="checkbox"
    checked={selectedVideos.has(video.id)}
    onChange={() => handleSelectVideo(video.id)}
    className="rounded"
  />
  {/* 现有的视频项内容 */}
</div>
```

- [ ] **Step 6: 验证TypeScript编译**

运行: `cd frontend && npm run build`

Expected: 编译成功，无错误

---

## Task 6: 测试和验证

**Covers:** [S7]

- [ ] **Step 1: 启动后端服务**

运行: `cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`

- [ ] **Step 2: 启动前端服务**

运行: `cd frontend && npm run dev`

- [ ] **Step 3: 测试批量下载功能**

1. 打开前端页面
2. 上传几个视频并等待处理完成
3. 选择多个视频
4. 点击下载按钮
5. 验证ZIP文件包含正确的笔记和原文

- [ ] **Step 4: 测试错误场景**

1. 测试未选择视频时下载按钮禁用
2. 测试选择未完成视频时的错误提示
3. 测试网络错误时的错误处理

---

## 自我审查

### 1. 规范覆盖检查
- [S1] 问题描述：已覆盖（Task 5）
- [S2] 解决方案概述：已覆盖（Task 1-5）
- [S3] 前端设计：已覆盖（Task 5）
- [S4] 后端设计：已覆盖（Task 1-2）
- [S5] 数据结构：已覆盖（Task 1, 3）
- [S6] 错误处理：已覆盖（Task 2, 5）
- [S7] 测试方案：已覆盖（Task 6）
- [S8] 部署考虑：已覆盖（无需额外操作）
- [S9] 性能考虑：已覆盖（Task 2中的限制）
- [S10] 安全考虑：已覆盖（Task 2中的验证）

### 2. 占位符扫描
无TBD、TODO或模糊要求。

### 3. 类型一致性检查
- `BatchDownloadRequest` 类型在前后端一致
- API端点路径一致
- 响应类型一致

---

## 执行建议

这个计划包含6个任务，其中Task 1-4是独立的，Task 5依赖于Task 3-4，Task 6依赖于所有前置任务。

建议使用compose:subagent技能执行，每个任务一个子代理，确保代码质量。