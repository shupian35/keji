import { Routes, Route, Link, useLocation } from "react-router-dom";
import { useTheme } from "./hooks/useTheme";
import HomePage from "./pages/HomePage";
import TaskStatus from "./pages/TaskStatus";
import NoteViewer from "./pages/NoteViewer";
import VideoListPage from "./pages/VideoListPage";
import TaskListPage from "./pages/TaskListPage";
import SettingsPage from "./pages/SettingsPage";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const cycle = () => {
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
  };

  const icon = theme === "system" ? "🖥️" : theme === "dark" ? "🌙" : "☀️";
  const label = theme === "system" ? "跟随系统" : theme === "dark" ? "夜间模式" : "日间模式";

  return (
    <button
      onClick={cycle}
      className="text-sm px-2 py-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      title={`当前: ${label}（点击切换）`}
    >
      {icon}
    </button>
  );
}

function Header() {
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <header className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
          📝 课记
        </Link>
        <div className="flex items-center gap-4">
          <Link
            to="/videos"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            📋 视频列表
          </Link>
          {!isHome && (
            <Link
              to="/"
              className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              上传新视频
            </Link>
          )}
          <Link
            to="/settings"
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            title="设置"
          >
            ⚙️
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/videos" element={<VideoListPage />} />
          <Route path="/tasks" element={<TaskListPage />} />
          <Route path="/task/:taskId" element={<TaskStatus />} />
          <Route path="/video/:videoId" element={<NoteViewer />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
