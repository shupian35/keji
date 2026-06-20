"""视频处理工具 — ffmpeg 封装"""

import os
import shutil
import subprocess
from pathlib import Path


def _find_ffmpeg() -> str:
    """查找 ffmpeg 可执行文件路径（兼容 Windows winget 安装）。"""
    # 1. 尝试直接用 ffmpeg（已在 PATH 中）
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        return ffmpeg

    # 2. Windows winget 常见安装位置
    if os.name == "nt":
        candidates = [
            os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe"),
            os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-*-full_build\bin\ffmpeg.exe"),
        ]
        import glob
        for pattern in candidates:
            for p in glob.glob(pattern):
                return p

    raise FileNotFoundError("找不到 ffmpeg，请安装后加入 PATH 或使用 winget install ffmpeg")


FFMPEG = _find_ffmpeg()


def extract_audio(video_path: str | Path, audio_path: str | Path) -> Path:
    """
    从视频文件中提取音频。

    输出格式：16kHz 采样率、单声道、16-bit WAV。

    Args:
        video_path: 输入视频文件路径
        audio_path: 输出音频文件路径

    Returns:
        Path: 输出音频文件路径
    """
    video_path = Path(video_path)
    audio_path = Path(audio_path)
    audio_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        FFMPEG,
        "-i",
        str(video_path),
        "-vn",                     # 不要视频流
        "-ar", "16000",            # 16kHz 采样率
        "-ac", "1",                # 单声道
        "-f", "wav",               # WAV 格式
        str(audio_path),
        "-y",                      # 覆盖已有文件
    ]

    subprocess.run(cmd, check=True, capture_output=True, text=True)
    return audio_path


def get_audio_duration(audio_path: str | Path) -> float:
    """获取音频文件的总时长（秒）。"""
    audio_path = Path(audio_path)
    cmd = [
        FFMPEG,
        "-i", str(audio_path),
        "-f", "null", "-",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    # 从 stderr 解析 Duration: HH:MM:SS.xx
    import re
    stderr = result.stderr or ""
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+)\.(\d+)", stderr)
    if match:
        h, m, s, cs = int(match.group(1)), int(match.group(2)), int(match.group(3)), int(match.group(4))
        return h * 3600 + m * 60 + s + cs / 100.0
    return 0.0


def extract_screenshot(
    video_path: str | Path,
    timestamp: float,
    output_path: str | Path,
) -> Path:
    """
    在视频指定时间点截取一帧画面。

    Args:
        video_path: 输入视频文件路径
        timestamp: 截取时间点（秒）
        output_path: 输出图片文件路径（建议 .jpg）

    Returns:
        Path: 输出图片文件路径
    """
    video_path = Path(video_path)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        FFMPEG,
        "-ss", str(timestamp),     # 跳转到指定时间
        "-i", str(video_path),
        "-vframes", "1",           # 只取一帧
        "-q:v", "2",               # 高质量
        str(output_path),
        "-y",                      # 覆盖已有文件
    ]

    subprocess.run(cmd, check=True, capture_output=True, text=True)
    return output_path
