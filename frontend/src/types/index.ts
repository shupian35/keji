/** 视频处理状态 */
export type VideoStatus = "pending" | "processing" | "done" | "failed";

/** 语音转写 / 笔记片段（带时间戳） */
export interface Segment {
  start: number;
  end: number;
  text: string;
}

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
  segments: Segment[];
  transcript: Segment[];
}

/** 通用 API 包装 */
export interface ApiResponse<T> {
  data: T;
  message?: string;
}
