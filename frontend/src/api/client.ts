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

export default http;
