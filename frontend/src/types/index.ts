/** 视频处理状态 */
export type VideoStatus = "pending" | "processing" | "done" | "failed";

/** 任务状态响应 */
export interface TaskResponse {
  task_id: string;
  status: VideoStatus;
  progress: number;
  video_id: string | null;
  step?: string;
  error?: string;
}

/** 视频信息 */
export interface VideoInfo {
  id: string;
  filename: string;
  status: VideoStatus;
  progress: number;
  created_at: string;
}

/** 笔记响应 */
export interface NoteResponse {
  video_id: string;
  filename: string;
  note_id: string;
  content_md: string;
  transcript: string[];
}

/** 批量下载请求 */
export interface BatchDownloadRequest {
  video_ids: string[];
}

/** 设置项 */
export interface SettingItem {
  key: string;
  value: string | null;
  description: string | null;
}

/** 批量更新设置请求 */
export interface SettingsUpdate {
  settings: SettingItem[];
}

/** 通用 API 包装 */
export interface ApiResponse<T> {
  data: T;
  message?: string;
}
