import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function VideoUpload() {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const validateFile = (file: File): string | null => {
    // 检查文件类型
    const isVideo = file.type.startsWith("video/");
    if (!isVideo) {
      // 也检查常见视频扩展名（某些系统可能不给 MIME type）
      const ext = file.name.split(".").pop()?.toLowerCase();
      const videoExts = ["mp4", "avi", "mkv", "mov", "webm", "flv", "wmv"];
      if (!ext || !videoExts.includes(ext)) {
        return `不支持的文件类型: ${file.type || ext || "未知"}`;
      }
    }
    if (file.size === 0) return "文件为空";
    if (file.size > MAX_FILE_SIZE) return `文件过大 (${formatSize(file.size)}，上限 2 GB)`;
    return null;
  };

  const handleFile = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      setError(null);
      setSelectedFile(file);
      setUploading(true);
      setUploadProgress(0);

      try {
        // 使用 axios 直接调用以支持进度回调
        const form = new FormData();
        form.append("file", file);
        const result = await axios.post("/api/videos/upload", form, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 600_000, // 10 分钟上传超时
          onUploadProgress: (e) => {
            if (e.total) {
              setUploadProgress(Math.round((e.loaded / e.total) * 100));
            }
          },
        });
        navigate(`/task/${result.data.task_id}`);
      } catch (err) {
        if (axios.isCancel(err)) return;
        const msg =
          (err as any)?.response?.data?.detail ||
          (err as any)?.message ||
          "上传失败，请重试";
        setError(msg);
      } finally {
        setUploading(false);
      }
    },
    [navigate]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // 重置 input 以允许重新选择同一文件
      e.target.value = "";
    },
    [handleFile]
  );

  return (
    <div className="max-w-xl mx-auto mt-16 px-4">
      {/* 标题区 */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-3">
          📝 上传课程视频，生成 AI 笔记
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          支持 MP4、AVI、MKV、MOV 格式 · 最大 2 GB
        </p>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm flex items-start gap-2">
          <span className="text-lg flex-shrink-0">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* 上传区域 */}
      {!uploading ? (
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
            拖拽视频文件到此处，或点击选择
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-sm">支持 MP4, AVI, MKV, MOV, WebM</p>
        </div>
      ) : (
        /* 上传进度 */
        <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
          <div className="text-4xl mb-4 animate-bounce">📤</div>
          <p className="text-gray-700 dark:text-gray-200 font-medium mb-2">正在上传...</p>
          {selectedFile && (
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
              {selectedFile.name} ({formatSize(selectedFile.size)})
            </p>
          )}

          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 mb-2 overflow-hidden">
            <div
              className="bg-blue-500 h-4 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-gray-400 dark:text-gray-500 text-sm">
            {uploadProgress > 0 ? `${uploadProgress}%` : "准备中..."}
          </p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}
