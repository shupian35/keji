import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { getNotes, getMediaUrl, regenerateNotes } from "../api/client";
import type { NoteResponse } from "../types";

/* ─── 工具函数 ─────────────────────────────────────── */

/** 下载文件 */
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 导出 AI 笔记为 Markdown */
function exportNotes(contentMd: string, filename: string) {
  downloadFile(contentMd, `${filename}.md`, "text/markdown;charset=utf-8");
}

/** 导出语音转写原文为文本 */
function exportTranscript(transcript: string[], filename: string) {
  downloadFile(transcript.join("\n\n"), `${filename}_转写原文.txt`, "text/plain;charset=utf-8");
}

/* ─── 主组件 ──────────────────────────────────────── */

export default function NoteViewer() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();

  // 数据状态
  const [notes, setNotes] = useState<NoteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 播放状态
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // 转写原文折叠状态
  const [showTranscript, setShowTranscript] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // ── 加载笔记 ──────────────────────────────────
  useEffect(() => {
    if (!videoId) return;
    getNotes(videoId)
      .then(setNotes)
      .catch((err) => {
        const detail = err?.response?.data?.detail;
        setError(
          detail === "笔记尚未生成，请等待处理完成"
            ? "视频还在处理中，笔记尚未生成。请稍后刷新页面。"
            : detail || "获取笔记失败",
        );
      })
      .finally(() => setLoading(false));
  }, [videoId]);

  // ── 进度条拖拽 ──────────────────────────────────
  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const video = document.querySelector("video");
      if (!video || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      video.currentTime = ratio * duration;
    },
    [duration],
  );

  // ── 重新生成笔记 ──────────────────────────────────
  const handleRegenerate = async () => {
    if (!videoId || regenerating) return;
    setRegenerating(true);
    try {
      await regenerateNotes(videoId);
      navigate(`/task/${videoId}`);
    } catch (err) {
      console.error(err);
      alert("重新生成失败");
    } finally {
      setRegenerating(false);
    }
  };

  // ── 加载态 ──────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="animate-spin text-3xl">⚙️</div>
        <p className="text-gray-400 dark:text-gray-500">加载笔记中...</p>
      </div>
    );
  }

  // ── 错误态 ──────────────────────────────────────
  if (error) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <div className="text-5xl mb-4">😕</div>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
        <button
          onClick={() => navigate("/")}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          返回首页
        </button>
      </div>
    );
  }

  if (!notes) return null;

  return (
    <div className="h-[calc(100vh-57px)] flex flex-col">
      {/* ── 顶部工具栏 ─────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate max-w-[60%]" title={notes.filename}>
          📹 {notes.filename}
        </h2>
        <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
          <button
            onClick={() => exportNotes(notes.content_md, notes.filename.replace(/\.[^.]+$/, ""))}
            className="px-2 py-1 rounded bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
            title="导出 AI 课程笔记"
          >
            📥 导出笔记
          </button>
          {notes.transcript.length > 0 && (
            <button
              onClick={() => exportTranscript(notes.transcript, notes.filename.replace(/\.[^.]+$/, ""))}
              className="px-2 py-1 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
              title="导出语音转写原文"
            >
              📥 导出转写
            </button>
          )}
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="px-2 py-1 rounded bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors disabled:opacity-50"
            title="重新生成笔记"
          >
            {regenerating ? "生成中..." : "🔄 重新生成"}
          </button>
          <button
            onClick={() => navigate("/")}
            className="text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            上传新视频
          </button>
        </div>
      </div>

      {/* ── 主体：左侧视频 + 右侧笔记 ──────────── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* 左侧：视频区域 */}
        <div className="lg:w-5/12 xl:w-1/2 flex-shrink-0 flex flex-col bg-black">
          {/* 视频 */}
          <div className="relative flex-1 flex items-center justify-center">
            <video
              className="w-full max-h-full"
              src={videoId ? getMediaUrl(videoId) : ""}
              controls
              preload="metadata"
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            >
              您的浏览器不支持视频播放
            </video>
          </div>

          {/* 进度条（可点击） */}
          <div
            className="h-1 bg-gray-700 cursor-pointer group"
            onClick={handleProgressClick}
          >
            <div
              className="h-full bg-blue-500 transition-all duration-150"
              style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
            />
          </div>

          {/* 时间显示 */}
          <div className="px-3 py-1 text-xs text-gray-400 dark:text-gray-500 text-right">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        {/* 右侧：笔记 */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700">
          <div className="p-4 md:p-6">
            <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 sticky top-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur py-2 z-10">
              📝 AI 课程笔记
            </h1>

            {/* ── 纯 Markdown 渲染 ───────────── */}
            <div className="prose prose-gray dark:prose-invert max-w-none
              prose-headings:text-gray-800 dark:prose-headings:text-gray-100
              prose-h2:border-b prose-h2:pb-2 prose-h2:border-gray-200 dark:prose-h2:border-gray-700
              prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:leading-relaxed
              prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
              prose-pre:bg-gray-900 prose-pre:text-gray-100
              prose-li:text-gray-700 dark:prose-li:text-gray-300
            ">
              <ReactMarkdown>{notes.content_md}</ReactMarkdown>
            </div>

            {/* ── 语音转写原文 ─────────────────── */}
            {notes.transcript.length > 0 && (
              <div className="border-t border-gray-200 dark:border-gray-700 mt-6 pt-4">
                <button
                  onClick={() => setShowTranscript(!showTranscript)}
                  className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors w-full text-left"
                >
                  <span className={`transition-transform ${showTranscript ? "rotate-90" : ""}`}>▶</span>
                  📝 语音转写原文（{notes.transcript.length} 段）
                </button>

                {showTranscript && (
                  <div className="mt-3 space-y-2 max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                    {notes.transcript.map((text, idx) => (
                      <p key={idx} className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                        {text}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 格式化秒数为 mm:ss 或 hh:mm:ss */
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
