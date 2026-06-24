import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import VideoListPage from "../pages/VideoListPage";

vi.mock("../api/client", () => ({
  listVideos: vi.fn(),
  deleteVideo: vi.fn(),
  updateVideo: vi.fn(),
  retryVideo: vi.fn(),
  batchDownloadVideos: vi.fn(),
}));

import { listVideos, batchDownloadVideos } from "../api/client";

const mockListVideos = vi.mocked(listVideos);
const mockBatchDownload = vi.mocked(batchDownloadVideos);

const doneVideos = [
  { id: "00000000-0000-0000-0000-000000000001", filename: "a.mp4", status: "done" as const, progress: 1.0, created_at: "2025-01-01T00:00:00Z" },
  { id: "00000000-0000-0000-0000-000000000002", filename: "b.mp4", status: "done" as const, progress: 1.0, created_at: "2025-01-01T00:00:00Z" },
  { id: "00000000-0000-0000-0000-000000000003", filename: "c.mp4", status: "done" as const, progress: 1.0, created_at: "2025-01-01T00:00:00Z" },
];

const mixedVideos = [
  ...doneVideos,
  { id: "00000000-0000-0000-0000-000000000004", filename: "d.mp4", status: "processing" as const, progress: 0.5, created_at: "2025-01-01T00:00:00Z" },
  { id: "00000000-0000-0000-0000-000000000005", filename: "e.mp4", status: "pending" as const, progress: 0.0, created_at: "2025-01-01T00:00:00Z" },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <VideoListPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VideoListPage - 选择逻辑", () => {
  it("初始状态下下载按钮禁用", async () => {
    mockListVideos.mockResolvedValue(doneVideos);
    renderPage();

    await waitFor(() => expect(screen.queryByText("加载中...")).not.toBeInTheDocument());

    const downloadBtn = screen.getByText(/下载笔记和原文/);
    expect(downloadBtn).toBeDisabled();
  });

  it("点击复选框选中单个视频", async () => {
    mockListVideos.mockResolvedValue(doneVideos);
    renderPage();

    await waitFor(() => expect(screen.queryByText("加载中...")).not.toBeInTheDocument());

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]); // 第一个视频的复选框

    expect(screen.getByText("已选择 1 个视频")).toBeInTheDocument();
    expect(screen.getByText(/下载笔记和原文 \(1\)/)).toBeEnabled();
  });

  it("再次点击复选框取消选中", async () => {
    mockListVideos.mockResolvedValue(doneVideos);
    renderPage();

    await waitFor(() => expect(screen.queryByText("加载中...")).not.toBeInTheDocument());

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]); // 选中
    fireEvent.click(checkboxes[1]); // 取消

    expect(screen.queryByText(/已选择/)).not.toBeInTheDocument();
    expect(screen.getByText(/下载笔记和原文 \(0\)/)).toBeDisabled();
  });

  it("选中多个视频", async () => {
    mockListVideos.mockResolvedValue(doneVideos);
    renderPage();

    await waitFor(() => expect(screen.queryByText("加载中...")).not.toBeInTheDocument());

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]); // 视频1
    fireEvent.click(checkboxes[3]); // 视频3

    expect(screen.getByText("已选择 2 个视频")).toBeInTheDocument();
    expect(screen.getByText(/下载笔记和原文 \(2\)/)).toBeEnabled();
  });
});

describe("VideoListPage - 全选逻辑", () => {
  it("全选按钮选中所有已完成视频", async () => {
    mockListVideos.mockResolvedValue(mixedVideos);
    renderPage();

    await waitFor(() => expect(screen.queryByText("加载中...")).not.toBeInTheDocument());

    const selectAllCheckbox = screen.getAllByRole("checkbox")[0];
    fireEvent.click(selectAllCheckbox);

    expect(screen.getByText("已选择 3 个视频")).toBeInTheDocument();
  });

  it("全选只选中 status=done 的视频", async () => {
    mockListVideos.mockResolvedValue(mixedVideos);
    renderPage();

    await waitFor(() => expect(screen.queryByText("加载中...")).not.toBeInTheDocument());

    const selectAllCheckbox = screen.getAllByRole("checkbox")[0];
    fireEvent.click(selectAllCheckbox);

    const downloadBtn = screen.getByText(/下载笔记和原文 \(3\)/);
    expect(downloadBtn).toBeEnabled();
  });

  it("再次点击全选取消所有选中", async () => {
    mockListVideos.mockResolvedValue(doneVideos);
    renderPage();

    await waitFor(() => expect(screen.queryByText("加载中...")).not.toBeInTheDocument());

    const selectAllCheckbox = screen.getAllByRole("checkbox")[0];
    fireEvent.click(selectAllCheckbox); // 全选
    fireEvent.click(selectAllCheckbox); // 取消

    expect(screen.queryByText(/已选择/)).not.toBeInTheDocument();
    expect(screen.getByText(/下载笔记和原文 \(0\)/)).toBeDisabled();
  });

  it("手动选中所有完成后全选按钮变为选中状态", async () => {
    mockListVideos.mockResolvedValue(doneVideos);
    renderPage();

    await waitFor(() => expect(screen.queryByText("加载中...")).not.toBeInTheDocument());

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]); // 视频1
    fireEvent.click(checkboxes[2]); // 视频2
    fireEvent.click(checkboxes[3]); // 视频3

    const selectAllCheckbox = checkboxes[0];
    expect(selectAllCheckbox).toBeChecked();
  });
});

describe("VideoListPage - 错误场景", () => {
  it("下载失败时显示错误信息和重试按钮", async () => {
    mockListVideos.mockResolvedValue(doneVideos);
    mockBatchDownload.mockRejectedValue(new Error("Network error"));
    renderPage();

    await waitFor(() => expect(screen.queryByText("加载中...")).not.toBeInTheDocument());

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);

    const downloadBtn = screen.getByText(/下载笔记和原文/);
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(screen.getByText("下载失败，请重试")).toBeInTheDocument();
    });
    expect(screen.getByText("重试")).toBeInTheDocument();
  });

  it("未选择视频时下载按钮显示 (0) 且禁用", async () => {
    mockListVideos.mockResolvedValue(doneVideos);
    renderPage();

    await waitFor(() => expect(screen.queryByText("加载中...")).not.toBeInTheDocument());

    const downloadBtn = screen.getByText(/下载笔记和原文 \(0\)/);
    expect(downloadBtn).toBeDisabled();
  });
});
