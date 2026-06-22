import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB

interface UploadItem {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  taskId: string | null;
  error: string | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function validateFile(file: File): string | null {
  const isMedia = file.type.startsWith("video/") || file.type.startsWith("audio/");
  if (!isMedia) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const mediaExts = ["mp4", "avi", "mkv", "mov", "webm", "flv", "wmv", "mp3", "wav", "m4a", "aac", "ogg", "flac"];
    if (!ext || !mediaExts.includes(ext)) {
      return `不支持的文件类型: ${file.type || ext || "未知"}`;
    }
  }
  if (file.size === 0) return "文件为空";
  if (file.size > MAX_FILE_SIZE) return `文件过大 (${formatSize(file.size)}，上限 2 GB)`;
  return null;
}

export default function VideoUpload() {
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const updateItem = (index: number, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const uploadFile = useCallback(
    async (item: UploadItem, index: number) => {
      if (item.status !== "pending") return;

      updateItem(index, { status: "uploading", progress: 0, error: null });

      try {
        const form = new FormData();
        form.append("file", item.file);
        const result = await axios.post("/api/videos/upload", form, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 600_000,
          onUploadProgress: (e) => {
            if (e.total) {
              updateItem(index, { progress: Math.round((e.loaded / e.total) * 100) });
            }
          },
        });
        updateItem(index, { status: "done", taskId: result.data.task_id, progress: 100 });
      } catch (err) {
        if (axios.isCancel(err)) return;
        const msg =
          (err as any)?.response?.data?.detail ||
          (err as any)?.message ||
          "上传失败";
        updateItem(index, { status: "error", error: msg });
      }
    },
    []
  );

  const startUpload = useCallback(
    async (files: File[]) => {
      const validated: UploadItem[] = [];
      for (const file of files) {
        const error = validateFile(file);
        if (error) {
          validated.push({ file, status: "error", progress: 0, taskId: null, error });
        } else {
          validated.push({ file, status: "pending", progress: 0, taskId: null, error: null });
        }
      }
      setItems(validated);
      setUploading(true);

      for (let i = 0; i < validated.length; i++) {
        if (validated[i].status === "error") continue;
        await uploadFile(validated[i], i);
      }

      setUploading(false);
    },
    [uploadFile]
  );

  const handleFiles = useCallback(
    (fileList: FileList) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;
      startUpload(files);
    },
    [startUpload]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        handleFiles(e.target.files);
      }
      e.target.value = "";
    },
    [handleFiles]
  );

  const doneItems = items.filter((i) => i.status === "done");
  const allDone = items.length > 0 && !uploading && items.every((i) => i.status === "done" || i.status === "error");

  const goToTaskList = () => {
    const ids = doneItems.map((i) => i.taskId).filter(Boolean).join(",");
    if (ids) navigate(`/tasks?ids=${ids}`);
  };

  return (
    <div className="max-w-xl mx-auto mt-16 px-4">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-3">
          📝 上传课程视频，生成 AI 笔记
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          支持 MP4、AVI、MKV、MOV、MP3、WAV 等格式 · 最大 2 GB · 可多选
        </p>
      </div>

      {!uploading && items.length === 0 ? (
        <div
          className={`border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer transition-all
            ${dragging
              ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20 scale-[1.02]"
              : "border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="text-6xl mb-5">📤</div>
          <p className="text-gray-600 dark:text-gray-300 text-lg mb-1">
            拖拽文件到此处，或点击选择
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-sm">支持多个文件 · 视频和音频</p>
        </div>
      ) : (
        <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
          <div className="space-y-3 mb-4">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                    {item.file.name}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {formatSize(item.file.size)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {item.status === "pending" && (
                    <span className="text-xs text-gray-400">等待中</span>
                  )}
                  {item.status === "uploading" && (
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{item.progress}%</span>
                    </div>
                  )}
                  {item.status === "done" && (
                    <span className="text-xs text-green-500">✓ 完成</span>
                  )}
                  {item.status === "error" && (
                    <span className="text-xs text-red-500 truncate max-w-32" title={item.error || ""}>
                      {item.error || "失败"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {allDone && doneItems.length > 0 && (
            <button
              onClick={goToTaskList}
              className="w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              查看处理进度 ({doneItems.length} 个文件)
            </button>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,audio/*"
        multiple
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}
