import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getTask } from "../api/client";
import type { VideoStatus as VideoStatusType } from "../types";

const STATUS_CONFIG: Record<
  VideoStatusType,
  { icon: string; label: string; color: string }
> = {
  pending:  { icon: "🕐", label: "排队等待中...",    color: "text-yellow-600 dark:text-yellow-400" },
  processing: { icon: "⚙️", label: "正在处理...", color: "text-blue-600 dark:text-blue-400" },
  done:     { icon: "✅", label: "处理完成！",      color: "text-green-600 dark:text-green-400" },
  failed:   { icon: "❌", label: "处理失败",        color: "text-red-600 dark:text-red-400" },
};

export default function TaskStatus() {
  const { taskId } = useParams<{ taskId: string }>();
  const [status, setStatus] = useState<VideoStatusType>("pending");
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const navigate = useNavigate();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const isTerminal = status === "done" || status === "failed";

  const poll = useCallback(async () => {
    if (!taskId) return;
    try {
      const res = await getTask(taskId);
      setStatus(res.status);
      setProgress(res.progress);
      if (res.step) setStep(res.step);
      if (res.error) setError(res.error);
      setPollError(null);

      // 成功 → 跳转
      if (res.status === "done" && res.video_id) {
        setTimeout(() => navigate(`/video/${res.video_id}`), 600);
      }
    } catch (err) {
      setPollError("查询状态失败，请检查网络连接");
      console.error(err);
    }
  }, [taskId, navigate]);

  useEffect(() => {
    if (!taskId) return;

    // 立即查询一次
    poll();

    // 每 2 秒轮询（直到终态停止）
    intervalRef.current = setInterval(() => {
      poll();
    }, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [taskId, poll]);

  // 达到终态时停止轮询
  useEffect(() => {
    if (isTerminal && intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  }, [isTerminal]);

  const cfg = STATUS_CONFIG[status];

  return (
    <div className="max-w-md mx-auto mt-20 px-4 text-center">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-8">任务状态</h1>

      {/* 状态卡片 */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-8 shadow-sm">
        {/* 图标 */}
        <div className="text-6xl mb-4">
          {isTerminal ? cfg.icon : (
            <span className="inline-block animate-spin">⚙️</span>
          )}
        </div>

        {/* 状态文字 */}
        <p className={`text-lg font-semibold mb-1 ${cfg.color}`}>
          {cfg.label}
        </p>
        {step && <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">{step}</p>}

        {/* 进度条（仅处理中显示） */}
        {status === "processing" && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-2">
              <div
                className="bg-blue-500 h-3 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${Math.max(5, Math.round(progress * 100))}%` }}
              />
            </div>
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              {progress > 0 ? `${Math.round(progress * 100)}%` : "初始化..."}
            </p>
          </div>
        )}

        {/* 成功提示 */}
        {status === "done" && (
          <p className="text-green-600 dark:text-green-400 text-sm mt-4 animate-pulse">
            即将跳转到笔记页面...
          </p>
        )}

        {/* 错误详情 */}
        {(error || pollError) && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm text-left">
            {error || pollError}
          </div>
        )}

        {/* 失败时的操作 */}
        {status === "failed" && (
          <div className="mt-6 flex flex-col gap-2">
            <button
              onClick={() => navigate("/")}
              className="w-full py-2 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
            >
              重新上传
            </button>
          </div>
        )}
      </div>

      {/* 返回首页链接 */}
      {status !== "done" && (
        <p className="mt-6 text-sm text-gray-400 dark:text-gray-500">
          <button
            onClick={() => navigate("/")}
            className="underline hover:text-gray-600 dark:hover:text-gray-300"
          >
            返回首页
          </button>
        </p>
      )}
    </div>
  );
}
