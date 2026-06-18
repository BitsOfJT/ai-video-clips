#!/usr/bin/env python3
"""
CLI entrypoint for local video transcription with faster-whisper.

The Electron renderer will spawn this script (or its PyInstaller executable)
and parse stdout/stderr:
    - PROGRESS: <percent> lines are emitted to stderr.
    - The final JSON is written to the path provided by --output-json.
    - Non-zero exit code indicates failure.
"""

from __future__ import annotations

import argparse
import json
import math
import multiprocessing
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from faster_whisper import WhisperModel

from utils.audio_extractor import extract_audio


def parse_args() -> argparse.Namespace:
    """Parse and return command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Transcribe a video with faster-whisper and emit word-level JSON."
    )
    parser.add_argument(
        "--video-path",
        required=True,
        help="Path to the input video or audio file.",
    )
    parser.add_argument(
        "--model-dir",
        required=True,
        help="Path to the faster-whisper model directory.",
    )
    parser.add_argument(
        "--output-json",
        required=True,
        help="Path where the transcript JSON will be written.",
    )
    parser.add_argument(
        "--extract-audio",
        action="store_true",
        help="Extract audio from the video before transcribing.",
    )
    parser.add_argument(
        "--ffmpeg-path",
        default="ffmpeg",
        help="Absolute path to the FFmpeg binary (used for audio extraction).",
    )
    return parser.parse_args()


def build_segment(segment: Any) -> dict[str, Any]:
    """Convert a faster-whisper Segment into a plain JSON-serializable dict.

    Args:
        segment: A faster_whisper.transcribe.Segment instance.

    Returns:
        A dictionary with id, start, end, text, and word-level details.
    """
    words = [
        {
            "start": word.start,
            "end": word.end,
            "word": word.word,
            "probability": word.probability,
        }
        for word in (segment.words or [])
    ]

    return {
        "id": segment.id,
        "start": segment.start,
        "end": segment.end,
        "text": segment.text,
        "words": words,
    }


def transcribe_audio(
    model_dir: str,
    audio_path: str,
    video_duration: float,
) -> list[dict[str, Any]]:
    """Transcribe an audio file and return a list of segment dictionaries.

    Progress is emitted to stderr as "PROGRESS: <percent>" lines.

    Args:
        model_dir: Path to the faster-whisper model directory.
        audio_path: Path to the WAV/audio file to transcribe.
        video_duration: Total duration in seconds, used to compute progress.

    Returns:
        A list of segment dictionaries ready for JSON serialization.
    """
    # Load the model on CPU with int8 quantization for broad compatibility.
    model = WhisperModel(
        model_size_or_path=model_dir,
        device="cpu",
        compute_type="int8",
    )

    # faster-whisper returns a generator; iterate to collect segments.
    segments_iter, _info = model.transcribe(
        audio_path,
        language="en",
        word_timestamps=True,
    )

    segments: list[dict[str, Any]] = []
    last_reported_percent = -1

    for segment in segments_iter:
        segments.append(build_segment(segment))

        # Avoid division-by-zero on zero-length inputs and clamp to [0, 100].
        if video_duration > 0:
            percent = min(100, max(0, int(math.floor(segment.end / video_duration * 100))))
        else:
            percent = 0

        # Throttle progress updates so we do not spam stderr.
        if percent != last_reported_percent:
            print(f"PROGRESS: {percent}", file=sys.stderr, flush=True)
            last_reported_percent = percent

    return segments


def get_video_duration(video_path: str) -> float:
    """Return the duration of a media file in seconds using ffprobe.

    Args:
        video_path: Path to the media file.

    Returns:
        Duration in seconds, or 0.0 if it cannot be determined.
    """
    if not shutil.which("ffprobe"):
        print("Warning: ffprobe not found in system PATH.", file=sys.stderr, flush=True)
        return 0.0

    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                video_path,
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return float(result.stdout.strip())
    except Exception as exc:  # noqa: BLE001
        # If ffprobe is unavailable or the file has no duration metadata, fall
        # back to 0.0. Progress reporting will then remain at 0% until done.
        print(f"Warning: could not determine video duration: {exc}", file=sys.stderr, flush=True)
        return 0.0


def main() -> None:
    """Run the transcription CLI."""
    args = parse_args()

    video_path = args.video_path
    model_dir = args.model_dir
    output_json = args.output_json

    if not os.path.exists(video_path):
        print(f"Error: Input file not found: {video_path}", file=sys.stderr, flush=True)
        sys.exit(1)

    # Optionally extract a clean WAV before transcription.
    if args.extract_audio:
        try:
            print(f"Extracting audio from {video_path}...", file=sys.stderr, flush=True)
            audio_path = extract_audio(video_path, ffmpeg_path=args.ffmpeg_path)
        except Exception as exc:
            print(f"Error extracting audio: {exc}", file=sys.stderr, flush=True)
            sys.exit(1)
    else:
        audio_path = video_path

    # Determine total duration for progress reporting.
    video_duration = get_video_duration(video_path)

    # Transcribe and collect segments.
    segments = transcribe_audio(model_dir, audio_path, video_duration)

    # Write the final transcript JSON.
    output_file = Path(output_json)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    with output_file.open("w", encoding="utf-8") as handle:
        json.dump({"segments": segments}, handle, indent=2)

    print(f"Transcript written to {output_json}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    multiprocessing.freeze_support()
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"Error: {exc}", file=sys.stderr, flush=True)
        sys.exit(1)
