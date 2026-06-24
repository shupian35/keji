import axios from "axios";
import type { TaskResponse, NoteResponse, VideoInfo } from "../types";

const http = axios.create({
  baseURL: "/api",
  timeout: 120000, // 上传可能较慢
});

/** 上传视频文件 */
export async function uploadVideo(file: File): Promise<TaskResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await http.post<TaskResponse>("/videos/upload", form);
  return res.data;
}

/** 查询任务状态 */
export async function getTask(taskId: string): Promise<TaskResponse> {
  const res = await http.get<TaskResponse>(`/tasks/${taskId}`);
  return res.data;
}

/** 获取笔记 */
export async function getNotes(videoId: string): Promise<NoteResponse> {
  const res = await http.get<NoteResponse>(`/videos/${videoId}/notes`);
  return res.data;
}

/** 获取视频媒体 URL */
export function getMediaUrl(videoId: string): string {
  return `/api/videos/${videoId}/media`;
}

/** 获取视频列表 */
export async function listVideos(): Promise<VideoInfo[]> {
  const res = await http.get<VideoInfo[]>("/videos");
  return res.data;
}

/** 更新视频文件名 */
export async function updateVideo(videoId: string, filename: string): Promise<VideoInfo> {
  const res = await http.patch<VideoInfo>(`/videos/${videoId}`, { filename });
  return res.data;
}

/** 删除视频 */
export async function deleteVideo(videoId: string): Promise<{ message: string }> {
  const res = await http.delete<{ message: string }>(`/videos/${videoId}`);
  return res.data;
}

/** 重新处理视频 */
export async function retryVideo(videoId: string): Promise<{ message: string }> {
  const res = await http.post<{ message: string }>(`/videos/${videoId}/retry`);
  return res.data;
}

/** 重新生成笔记（优先使用已有原文） */
export async function regenerateNotes(videoId: string): Promise<{ message: string }> {
  const res = await http.post<{ message: string }>(`/videos/${videoId}/regenerate-notes`);
  return res.data;
}

/** 批量下载视频（返回 ZIP 文件流） */
export async function batchDownloadVideos(videoIds: string[]): Promise<Blob> {
  const res = await http.post("/videos/batch-download", { video_ids: videoIds }, {
    responseType: "blob",
  });
  // 如果服务器返回JSON错误，axios会将错误包装成Blob
  if (res.data.type === "application/json") {
    const text = await res.data.text();
    const error = JSON.parse(text);
    throw new Error(error.detail || "下载失败");
  }
  return res.data;
}

export default http;
