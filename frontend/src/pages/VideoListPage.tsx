import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listVideos, deleteVideo, updateVideo, retryVideo, batchDownloadVideos } from "../api/client";
import type { VideoInfo, VideoStatus } from "../types";

const STATUS_BADGE: Record<VideoStatus, { label: string; cls: string }> = {
  pending:    { label: "等待中",  cls: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300" },
  processing: { label: "处理中",  cls: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" },
  done:       { label: "已完成",  cls: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300" },
  failed:     { label: "失败",    cls: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300" },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function VideoListPage() {
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const loadVideos = () => {
    listVideos()
      .then(setVideos)
      .catch((err) => {
        setError("加载视频列表失败");
        console.error(err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadVideos(); }, []);

  const handleEdit = (v: VideoInfo) => {
    setEditingId(v.id);
    setEditValue(v.filename);
  };

  const handleSave = async (id: string) => {
    const name = editValue.trim();
    if (!name) return;
    try {
      await updateVideo(id, name);
      setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, filename: name } : v)));
    } catch (err) {
      console.error(err);
    } finally {
      setEditingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteVideo(id);
      setVideos((prev) => prev.filter((v) => v.id !== id));
      setSelectedVideos((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await retryVideo(id);
      setVideos((prev) => prev.map((v) =>
        v.id === id ? { ...v, status: "pending" as VideoStatus, progress: 0 } : v
      ));
    } catch (err) {
      console.error(err);
    } finally {
      setRetryingId(null);
    }
  };

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
    const completedVideos = videos.filter(v => v.status === "done");
    if (selectedVideos.size === completedVideos.length && completedVideos.length > 0) {
      setSelectedVideos(new Set());
    } else {
      setSelectedVideos(new Set(completedVideos.map(v => v.id)));
    }
  };

  const handleBatchDownload = async () => {
    if (selectedVideos.size === 0) return;

    setIsDownloading(true);
    setDownloadError(null);
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
    } catch (error) {
      console.error('下载失败:', error);
      setDownloadError('下载失败，请重试');
    } finally {
      setIsDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500">
        加载中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <p className="text-red-500 dark:text-red-400 mb-4">{error}</p>
        <button onClick={() => navigate("/")} className="text-blue-500 dark:text-blue-400 underline">返回首页</button>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="max-w-xl mx-auto mt-20 text-center">
        <div className="text-5xl mb-4">📭</div>
        <p className="text-gray-500 dark:text-gray-400 mb-4">还没有上传任何视频</p>
        <button
          onClick={() => navigate("/")}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          去上传
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6">📋 上传记录</h1>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={selectedVideos.size === videos.filter(v => v.status === "done").length && videos.filter(v => v.status === "done").length > 0}
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

        <div className="flex items-center space-x-2">
          <button
            onClick={handleBatchDownload}
            disabled={selectedVideos.size === 0 || isDownloading}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
          >
            {isDownloading ? '下载中...' : `下载笔记和原文 (${selectedVideos.size})`}
          </button>
          {downloadError && (
            <button
              onClick={handleBatchDownload}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              重试
            </button>
          )}
        </div>
      </div>

      {downloadError && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 text-sm">
          {downloadError}
        </div>
      )}

      <div className="space-y-2">
        {videos.map((v) => {
          const badge = STATUS_BADGE[v.status];
          const isDone = v.status === "done";
          const isEditing = editingId === v.id;
          const isDeleting = deletingId === v.id;
          const isRetrying = retryingId === v.id;
          const canRetry = v.status === "failed" || v.status === "pending";

          return (
            <div
              key={v.id}
              className={`
                bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-5 py-4
                transition-all hover:shadow-sm
                ${isDone ? "hover:border-green-300 dark:hover:border-green-600" : "hover:border-gray-300 dark:hover:border-gray-500"}
              `}
            >
              <div className="flex items-center justify-between">
                {/* 复选框 */}
                <input
                  type="checkbox"
                  checked={selectedVideos.has(v.id)}
                  onChange={() => handleSelectVideo(v.id)}
                  className="rounded mr-4"
                />

                {/* 左侧信息 */}
                <div
                  className="flex-1 min-w-0 mr-4 cursor-pointer"
                  onClick={() => {
                    if (isEditing) return;
                    if (isDone) {
                      navigate(`/video/${v.id}`);
                    } else {
                      navigate(`/task/${v.id}`);
                    }
                  }}
                >
                  {isEditing ? (
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSave(v.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="flex-1 text-sm px-2 py-1 border border-blue-400 rounded dark:bg-gray-800 dark:text-gray-100 focus:outline-none"
                      />
                      <button
                        onClick={() => handleSave(v.id)}
                        className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate" title={v.filename}>
                        {v.filename}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {formatDate(v.created_at)}
                      </p>
                    </>
                  )}
                </div>

                {/* 右侧状态 + 操作 */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* 进度条（处理中） */}
                  {v.status === "processing" && (
                    <div className="w-20">
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${Math.round(v.progress * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* 状态标签 */}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
                    {badge.label}
                  </span>

                  {!isEditing && (
                    <>
                      {/* 编辑按钮 */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEdit(v); }}
                        className="text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors"
                        title="编辑文件名"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>

                      {/* 重新处理按钮 */}
                      {canRetry && (
                        isRetrying ? (
                          <span className="text-xs text-blue-500 dark:text-blue-400">处理中...</span>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRetry(v.id); }}
                            className="text-gray-400 hover:text-orange-500 dark:text-gray-500 dark:hover:text-orange-400 transition-colors"
                            title="重新处理"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </button>
                        )
                      )}

                      {/* 删除按钮 */}
                      {isDeleting ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleDelete(v.id)}
                            className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                          >
                            确认
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeletingId(v.id); }}
                          className="text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
                          title="删除"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}

                      {/* 箭头 */}
                      <span className="text-gray-300 dark:text-gray-600 text-lg">→</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
