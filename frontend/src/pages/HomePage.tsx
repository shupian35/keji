import VideoUpload from "../components/VideoUpload";

export default function HomePage() {
  return (
    <div>
      <VideoUpload />

      {/* 底部提示 */}
      <div className="max-w-xl mx-auto mt-12 px-4 text-center text-gray-400 dark:text-gray-500 text-sm">
        <p>
          🔒 语音识别完全在本地进行，不上传音频到云端
          {" · "}
          📝 笔记使用 AI 大模型生成
        </p>
      </div>
    </div>
  );
}
