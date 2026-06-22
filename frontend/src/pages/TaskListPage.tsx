import { useEffect, useState, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import axios from "axios";

interface TaskInfo {
  taskId: string;
  filename: string;
  status: string;
  progress: number;
  videoId: string | null;
  step: string;
  error: string | null;
}

export default function TaskListPage() {
  const [searchParams] = useSearchParams();
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const ids = searchParams.get("ids")?.split(",").filter(Boolean) || [];

  const fetchTasks = useCallback(async () => {
    if (ids.length === 0) {
      try {
        const res = await axios.get("/api/videos");
        setTasks(
          res.data.map((v: any) => ({
            taskId: v.id,
            filename: v.filename,
            status: v.status,
            progress: v.progress,
            videoId: v.id,
            step: "",
            error: null,
          }))
        );
      } catch {
        setTasks([]);
      }
      setLoading(false);
      return;
    }

    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await axios.get(`/api/tasks/${id}`);
          const d = res.data;
          return {
            taskId: d.task_id,
            filename: d.filename || "处理中",
            status: d.status,
            progress: d.progress,
            videoId: d.video_id,
            step: d.step,
            error: d.error || null,
          };
        } catch {
          return {
            taskId: id,
            filename: "未知文件",
            status: "failed",
            progress: 0,
            videoId: null,
            step: "",
            error: "查询失败",
          };
        }
      })
    );
    setTasks(results);
    setLoading(false);
    return results;
  }, [ids.join(",")]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    const poll = async () => {
      const results = await fetchTasks();
      if (results && results.every((t) => t.status === "done" || t.status === "failed")) {
        clearInterval(timer);
      }
    };
    poll();
    timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, [fetchTasks]);

  const statusColor = (s: string) => {
    switch (s) {
      case "done": return "text-green-500";
      case "failed": return "text-red-500";
      case "processing": return "text-blue-500";
      default: return "text-gray-400";
    }
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case "pending": return "等待中";
      case "processing": return "处理中";
      case "done": return "已完成";
      case "failed": return "失败";
      default: return s;
    }
  };

  return (
    <div className="max-w-3xl mx-auto mt-16 px-4">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">
        {ids.length > 0 ? "上传任务" : "最近视频"}
      </h1>

      {loading ? (
        <p className="text-gray-400 text-center py-10">加载中...</p>
      ) : tasks.length === 0 ? (
        <p className="text-gray-400 text-center py-10">暂无任务</p>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <div
              key={t.taskId}
              className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-700 dark:text-gray-200 truncate">
                  {t.filename}
                </p>
                {t.status === "processing" && (
                  <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round(t.progress * 100)}%` }}
                    />
                  </div>
                )}
                {t.error && (
                  <p className="text-xs text-red-500 mt-1">{t.error}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-medium ${statusColor(t.status)}`}>
                  {statusLabel(t.status)}
                </span>
                {t.status === "done" && t.videoId && (
                  <Link
                    to={`/video/${t.videoId}`}
                    className="text-sm text-blue-500 hover:text-blue-600"
                  >
                    查看笔记
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 text-center">
        <Link to="/" className="text-sm text-gray-400 hover:text-gray-600">
          返回上传
        </Link>
      </div>
    </div>
  );
}
