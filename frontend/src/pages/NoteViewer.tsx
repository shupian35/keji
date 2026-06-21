import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { getNotes, getMediaUrl } from "../api/client";
import type { NoteResponse } from "../types";

/* ─── 工具函数 ─────────────────────────────────────── */

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
function exportTranscript(transcript: { start: number; end: number; text: string }[], filename: string) {
  const lines = transcript.map(
    (seg) => `[${formatTime(seg.start)} - ${formatTime(seg.end)}] ${seg.text}`
  );
  const content = lines.join("\n\n");
  downloadFile(content, `${filename}_转写原文.txt`, "text/plain;charset=utf-8");
}

/** 节流：在 delay 毫秒内最多执行一次 */
function useThrottledCallback<T extends (...args: any[]) => void>(
  fn: T,
  delay: number,
): T {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const lastRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const throttled = useCallback(
    (...args: any[]) => {
      const now = Date.now();
      const remaining = delay - (now - lastRef.current);
      if (remaining <= 0) {
        if (timerRef.current) clearTimeout(timerRef.current);
        lastRef.current = now;
        fnRef.current(...args);
      } else if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          lastRef.current = Date.now();
          timerRef.current = undefined;
          fnRef.current(...args);
        }, remaining);
      }
    },
    [delay],
  ) as T;
  return throttled;
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
  const [activeIndex, setActiveIndex] = useState(-1);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const notesContainerRef = useRef<HTMLDivElement>(null);

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

  // ── 转写原文折叠 ──────────────────────────────
  const [showTranscript, setShowTranscript] = useState(false);
  const hasTranscript = notes && notes.transcript.length > 0;

  // ── 时间同步：video timeupdate → 查找活跃段落 ─────
  const handleTimeUpdate = useThrottledCallback(() => {
    const video = videoRef.current;
    if (!video || !notes?.segments.length) return;
    const t = video.currentTime;
    setCurrentTime(t);

    // 二分查找当前活跃段落
    const segs = notes.segments;
    let lo = 0;
    let hi = segs.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const seg = segs[mid];
      if (t >= seg.start && t <= seg.end) {
        found = mid;
        break;
      }
      if (t < seg.start) {
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    // 如果 t 在两个段落之间的间隙中，找最近的
    if (found === -1) {
      let minDist = Infinity;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const dist = Math.min(Math.abs(t - s.start), Math.abs(t - s.end));
        if (dist < minDist) {
          minDist = dist;
          found = i;
        }
      }
    }

    if (found !== activeIndex) {
      setActiveIndex(found);
    }
  }, 250);

  // ── 活跃段落自动滚入视图 ────────────────────────
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = segmentRefs.current[activeIndex];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeIndex]);

  // ── 点击段落 → 跳转视频 ─────────────────────────
  const seekTo = useCallback((startTime: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = startTime;
    setCurrentTime(startTime);
  }, []);

  // ── 进度条拖拽 ──────────────────────────────────
  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const video = videoRef.current;
      if (!video || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      video.currentTime = ratio * duration;
    },
    [duration],
  );

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

  const hasSegments = notes.segments.length > 0;

  return (
    <div className="h-[calc(100vh-57px)] flex flex-col">
      {/* ── 顶部工具栏 ─────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate max-w-[60%]" title={notes.filename}>
          📹 {notes.filename}
        </h2>
        <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
          {hasSegments && (
            <span>
              共 {notes.segments.length} 个段落
            </span>
          )}
          <button
            onClick={() => exportNotes(notes.content_md, notes.filename.replace(/\.[^.]+$/, ""))}
            className="px-2 py-1 rounded bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
            title="导出 AI 课程笔记"
          >
            📥 导出笔记
          </button>
          {hasTranscript && (
            <button
              onClick={() => exportTranscript(notes.transcript, notes.filename.replace(/\.[^.]+$/, ""))}
              className="px-2 py-1 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
              title="导出语音转写原文"
            >
              📥 导出转写
            </button>
          )}
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
              ref={videoRef}
              className="w-full max-h-full"
              src={videoId ? getMediaUrl(videoId) : ""}
              controls
              preload="metadata"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onSeeked={(e) => setCurrentTime(e.currentTarget.currentTime)}
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
        <div
          ref={notesContainerRef}
          className="flex-1 overflow-y-auto bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700"
        >
          <div className="p-4 md:p-6">
            <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 sticky top-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur py-2 z-10">
              📝 AI 课程笔记
            </h1>

            {hasSegments ? (
              /* ── 分段渲染模式 ───────────────── */
              <div className="space-y-0">
                {notes.segments.map((seg, idx) => {
                  const isActive = idx === activeIndex;
                  const isPast = seg.end < currentTime;

                  return (
                    <div
                      key={idx}
                      ref={(el) => { segmentRefs.current[idx] = el; }}
                      onClick={() => seekTo(seg.start)}
                      className={`
                        px-4 py-3 cursor-pointer transition-all duration-200 border-l-4
                        ${isActive
                          ? "bg-blue-50 dark:bg-blue-900/30 border-blue-500 shadow-sm"
                          : isPast
                            ? "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                            : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"}
                      `}
                    >
                      {/* 时间戳 */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); seekTo(seg.start); }}
                          className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-mono"
                          title="点击跳转到此时间点"
                        >
                          ▶ {formatTime(seg.start)}
                        </button>
                        <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                          {formatTime(seg.end)}
                        </span>
                        <span className="text-gray-300 dark:text-gray-600 text-xs">
                          ({(seg.end - seg.start).toFixed(0)}s)
                        </span>
                      </div>

                      {/* 笔记内容 */}
                      <div
                        className="prose prose-sm max-w-none dark:prose-invert
                          prose-headings:text-gray-800 dark:prose-headings:text-gray-100 prose-headings:my-1
                          prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:my-1 prose-p:leading-relaxed
                          prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-li:my-0.5
                          prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                          prose-strong:text-gray-800 dark:prose-strong:text-gray-100
                        "
                      >
                        <ReactMarkdown>{seg.text}</ReactMarkdown>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ── 纯 Markdown 降级模式 ───────── */
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
            )}
          </div>

          {/* 原始转写原文 */}
          {hasTranscript && (
            <div className="border-t border-gray-200 dark:border-gray-700 mt-4 pt-4">
              <button
                onClick={() => setShowTranscript(!showTranscript)}
                className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors w-full text-left"
              >
                <span className={`transition-transform ${showTranscript ? "rotate-90" : ""}`}>▶</span>
                📝 语音转写原文（{notes.transcript.length} 个片段）
              </button>

              {showTranscript && (
                <div className="mt-3 space-y-1 max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                  <div className="flex justify-end mb-2">
                    <button
                      onClick={() => exportTranscript(notes.transcript, notes.filename.replace(/\.[^.]+$/, ""))}
                      className="text-xs px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/70 transition-colors"
                    >
                      📥 导出转写原文
                    </button>
                  </div>
                  {notes.transcript.map((seg, idx) => (
                    <div
                      key={idx}
                      onClick={() => seekTo(seg.start)}
                      className="flex gap-3 px-2 py-1.5 rounded text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer transition-colors group"
                    >
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-mono flex-shrink-0 mt-0.5 group-hover:text-blue-500 dark:group-hover:text-blue-400">
                        {formatTime(seg.start)}
                      </span>
                      <span className="text-gray-600 dark:text-gray-300 group-hover:text-gray-800 dark:group-hover:text-gray-100 leading-relaxed">
                        {seg.text}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 底部提示 */}
          {hasSegments && (
            <p className="text-center text-gray-300 dark:text-gray-600 text-xs py-4">
              💡 点击段落跳转视频 · 播放时自动高亮对应段落
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
