"""
Audio extraction utilities for the transcription pipeline.

Provides FFmpeg-based audio extraction from arbitrary video files into a
16 kHz mono PCM WAV suitable for faster-whisper.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path


def extract_audio(video_path: str, output_dir: str | None = None) -> str:
    """Extract a 16 kHz mono WAV audio track from a video file.

    Args:
        video_path: Absolute or relative path to the input video.
        output_dir: Directory for the output WAV. Defaults to the directory
            containing the input video.

    Returns:
        The absolute path to the generated WAV file.

    Raises:
        FileNotFoundError: If the input video does not exist.
        RuntimeError: If FFmpeg exits with a non-zero status.
    """
    video_file = Path(video_path).resolve()

    if not video_file.exists():
        raise FileNotFoundError(f"Video file not found: {video_file}")

    destination_dir = Path(output_dir).resolve() if output_dir else video_file.parent
    destination_dir.mkdir(parents=True, exist_ok=True)

    stem = video_file.stem
    output_path = destination_dir / f"{stem}_audio.wav"

    command = [
        "ffmpeg",
        "-i",
        str(video_file),
        "-vn",              # Disable video stream.
        "-acodec", "pcm_s16le",  # 16-bit little-endian PCM.
        "-ar", "16000",     # 16 kHz sample rate (Whisper expects this).
        "-ac", "1",         # Mono audio.
        "-y",               # Overwrite output without prompting.
        str(output_path),
    ]

    try:
        subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        # Surface the FFmpeg stderr so callers can diagnose codec/path issues
        # without leaking the full command on a generic exception.
        raise RuntimeError(
            f"FFmpeg failed to extract audio from {video_file}: {exc.stderr.strip()}"
        ) from exc

    return str(output_path.resolve())
