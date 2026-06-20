import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listVideos } from "../api/client";
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

  useEffect(() => {
    listVideos()
      .then(setVideos)
      .catch((err) => {
        setError("加载视频列表失败");
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, []);

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

      <div className="space-y-2">
        {videos.map((v) => {
          const badge = STATUS_BADGE[v.status];
          const isDone = v.status === "done";

          return (
            <div
              key={v.id}
              onClick={() => {
                if (isDone) {
                  navigate(`/video/${v.id}`);
                } else {
                  navigate(`/task/${v.id}`);
                }
              }}
              className={`
                bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-5 py-4 flex items-center justify-between
                cursor-pointer transition-all hover:shadow-sm
                ${isDone ? "hover:border-green-300 dark:hover:border-green-600" : "hover:border-gray-300 dark:hover:border-gray-500"}
              `}
            >
              {/* 左侧信息 */}
              <div className="flex-1 min-w-0 mr-4">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate" title={v.filename}>
                  {v.filename}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {formatDate(v.created_at)}
                </p>
              </div>

              {/* 右侧状态 + 操作 */}
              <div className="flex items-center gap-3 flex-shrink-0">
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

                {/* 箭头 */}
                <span className="text-gray-300 dark:text-gray-600 text-lg">→</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
