import { useEffect, useState } from "react";
import { getSettings, updateSettings } from "../api/client";
import type { SettingItem } from "../types";

const DEFAULT_SETTINGS: SettingItem[] = [
  { key: "STT_API_URL", value: "", description: "语音转文字API地址" },
  { key: "STT_API_KEY", value: "", description: "语音转文字API Key" },
  { key: "STT_MODEL", value: "", description: "语音转文字模型名称" },
  { key: "AUDIO_CHUNK_ENABLED", value: "true", description: "启用长音频分段转写（超过10分钟自动在静音处切分）" },
  { key: "LLM_API_URL", value: "", description: "课程笔记API地址" },
  { key: "LLM_API_KEY", value: "", description: "课程笔记API Key" },
  { key: "LLM_MODEL", value: "", description: "课程笔记模型名称" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingItem[]>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await getSettings();
      const merged = DEFAULT_SETTINGS.map((defaultItem) => {
        const backendItem = data.find((item) => item.key === defaultItem.key);
        return backendItem || defaultItem;
      });
      setSettings(merged);
    } catch (err) {
      console.error("加载设置失败:", err);
      setError("加载设置失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    // 表单验证：检查必填项
    const requiredFields = ["STT_API_URL", "STT_API_KEY", "LLM_API_URL", "LLM_API_KEY"];
    const missingFields = requiredFields.filter((key) => {
      const item = settings.find((s) => s.key === key);
      return !item?.value?.trim();
    });

    if (missingFields.length > 0) {
      setError(`请填写必填项: ${missingFields.join(", ")}`);
      setSaving(false);
      return;
    }

    try {
      await updateSettings(settings);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("保存设置失败:", err);
      setError("保存设置失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setSettings((prev) =>
      prev.map((item) => (item.key === key ? { ...item, value } : item))
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500">
        加载中...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6">⚙️ 设置</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={handleSave}
            className="ml-4 px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
          >
            重试
          </button>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded text-green-600 dark:text-green-400 text-sm">
          设置已保存
        </div>
      )}

      <div className="space-y-6">
        {/* 语音转文字设置 */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">🎤 语音转文字设置</h2>
          <div className="space-y-4">
            {settings
              .filter((item) => item.key.startsWith("STT_"))
              .map((item) => (
                <div key={item.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {item.description}
                  </label>
                  <input
                    type={item.key.includes("KEY") ? "password" : "text"}
                    value={item.value || ""}
                    onChange={(e) => handleChange(item.key, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-gray-100"
                    placeholder={item.description || ""}
                  />
                </div>
              ))}

            {/* 长音频分段开关 */}
            {settings.filter((item) => item.key === "AUDIO_CHUNK_ENABLED").map((item) => (
              <div key={item.key} className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {item.description}
                </label>
                <button
                  type="button"
                  onClick={() => handleChange(item.key, item.value === "true" ? "false" : "true")}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    item.value === "true" ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      item.value === "true" ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 课程笔记设置 */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">📝 课程笔记设置</h2>
          <div className="space-y-4">
            {settings
              .filter((item) => item.key.startsWith("LLM_"))
              .map((item) => (
                <div key={item.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {item.description}
                  </label>
                  <input
                    type={item.key.includes("KEY") ? "password" : "text"}
                    value={item.value || ""}
                    onChange={(e) => handleChange(item.key, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-gray-100"
                    placeholder={item.description || ""}
                  />
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存设置"}
        </button>
      </div>
    </div>
  );
}
