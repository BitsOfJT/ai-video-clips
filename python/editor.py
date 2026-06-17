#!/usr/bin/env python3
"""
CLI entrypoint for video trimming, vertical cropping, and burning-in karaoke-style subtitles.

Spawns FFmpeg, processes output to stream progress back to Electron main process.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    """Parse and return command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Trim, crop, and burn subtitles into a video segment using FFmpeg."
    )
    parser.add_argument(
        "--video-path",
        required=True,
        help="Path to the input video file.",
    )
    parser.add_argument(
        "--output-path",
        required=True,
        help="Path where the output vertical video will be written.",
    )
    parser.add_argument(
        "--start-ms",
        type=int,
        required=True,
        help="Start time of the clip in milliseconds.",
    )
    parser.add_argument(
        "--end-ms",
        type=int,
        required=True,
        help="End time of the clip in milliseconds.",
    )
    parser.add_argument(
        "--crop-x",
        type=int,
        default=-1,
        help="Horizontal offset of the crop window (default: -1 for center crop).",
    )
    parser.add_argument(
        "--crop-y",
        type=int,
        default=-1,
        help="Vertical offset of the crop window (default: -1 for center/no crop).",
    )
    parser.add_argument(
        "--crop-w",
        type=int,
        default=-1,
        help="Width of the crop window (default: -1 for 9:16 vertical crop).",
    )
    parser.add_argument(
        "--crop-h",
        type=int,
        default=-1,
        help="Height of the crop window (default: -1 for 9:16 vertical crop).",
    )
    parser.add_argument(
        "--words-json",
        default="",
        help="Path to a JSON file containing the words to burn in as subtitles.",
    )
    return parser.parse_args()


def ms_to_ass_time(ms: int) -> str:
    """Convert milliseconds to ASS format (H:MM:SS.cs)."""
    if ms < 0:
        ms = 0
    hours = ms // 3600000
    minutes = (ms % 3600000) // 60000
    seconds = (ms % 60000) // 1000
    centiseconds = (ms % 1000) // 10
    return f"{hours}:{minutes:02d}:{seconds:02d}.{centiseconds:02d}"


def generate_ass_subtitles(
    words: list[dict[str, Any]],
    start_ms: int,
    end_ms: int,
    output_ass_path: str,
) -> None:
    """Generate an ASS file with karaoke-style highlighting for words in the time range.

    Args:
        words: List of word dicts containing 'word', 'start', 'end'.
        start_ms: Clip start time in milliseconds.
        end_ms: Clip end time in milliseconds.
        output_ass_path: File path where ASS subtitles will be written.
    """
    clip_duration_ms = end_ms - start_ms

    # Filter and adjust word timings to be relative to clip start
    adjusted_words = []
    for w in words:
        w_start_ms = int(w["start"] * 1000)
        w_end_ms = int(w["end"] * 1000)

        # Skip words entirely outside the clip range
        if w_end_ms <= start_ms or w_start_ms >= end_ms:
            continue

        # Clamp word boundaries to the clip limits
        rel_start = max(0, w_start_ms - start_ms)
        rel_end = min(clip_duration_ms, w_end_ms - start_ms)

        adjusted_words.append({
            "word": w["word"],
            "start_ms": rel_start,
            "end_ms": rel_end,
        })

    # Sort words chronologically
    adjusted_words.sort(key=lambda x: x["start_ms"])

    # Group words into lines
    lines = []
    current_line = []
    max_words_per_line = 3
    max_gap_ms = 600
    max_char_len = 22

    for w in adjusted_words:
        if not current_line:
            current_line.append(w)
        else:
            prev_w = current_line[-1]
            gap = w["start_ms"] - prev_w["end_ms"]
            line_text_len = sum(len(x["word"]) for x in current_line)

            if (
                len(current_line) >= max_words_per_line
                or gap > max_gap_ms
                or line_text_len > max_char_len
            ):
                lines.append(current_line)
                current_line = [w]
            else:
                current_line.append(w)

    if current_line:
        lines.append(current_line)

    # Build ASS content
    ass_lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 1080",
        "PlayResY: 1920",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        # Style: Yellow primary (highlight), White secondary (inactive), Black outline (opaque), centered bottom
        "Style: Default,Arial,68,&H0000FFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,5,0,2,10,10,600,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    for line in lines:
        line_start_ms = line[0]["start_ms"]
        line_end_ms = line[-1]["end_ms"]

        line_start_str = ms_to_ass_time(line_start_ms)
        line_end_str = ms_to_ass_time(line_end_ms)

        # Build karaoke text
        text_parts = []
        for i, w in enumerate(line):
            # Sum of tag durations must equal the line duration.
            # We absorb gaps between words into the preceding word's highlight duration.
            w_start = w["start_ms"]
            
            if i < len(line) - 1:
                next_start = line[i + 1]["start_ms"]
                duration_cs = (next_start - w_start) // 10
            else:
                duration_cs = (w["end_ms"] - w_start) // 10

            # Ensure duration is at least 1 centisecond
            duration_cs = max(1, duration_cs)

            word_text = w["word"]
            # Clean up double spaces if any, but ensure spacing is preserved
            text_parts.append(f"{{\\k{duration_cs}}}{word_text}")

        dialogue_text = "".join(text_parts)
        ass_lines.append(
            f"Dialogue: 0,{line_start_str},{line_end_str},Default,,0,0,0,,{dialogue_text}"
        )

    with open(output_ass_path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(ass_lines) + "\n")


def get_video_resolution(video_path: str) -> tuple[int, int]:
    """Retrieve video width and height using ffprobe.

    Returns:
        A tuple of (width, height), defaulting to (1920, 1080) if probing fails.
    """
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height",
                "-of", "csv=s=x:p=0",
                video_path,
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        parts = result.stdout.strip().split("x")
        if len(parts) == 2:
            return int(parts[0]), int(parts[1])
    except Exception as exc:  # noqa: BLE001
        print(f"Warning: could not probe video resolution: {exc}", file=sys.stderr, flush=True)
    return 1920, 1080


def escape_subtitle_path(path_str: str) -> str:
    """Escape backslashes and colons in a path for the FFmpeg subtitles filter."""
    # Convert windows path backslashes to forward slashes
    p = path_str.replace("\\", "/")
    # Escape colons (e.g. C:/path -> C\\:/path)
    p = p.replace(":", "\\:")
    # Escape single quotes
    p = p.replace("'", "'\\\\''")
    return p


def main() -> None:
    """Run the editing and exporting process."""
    args = parse_args()

    video_path = args.video_path
    output_path = args.output_path
    start_ms = args.start_ms
    end_ms = args.end_ms
    
    # Target clip duration in seconds
    duration_sec = (end_ms - start_ms) / 1000.0
    if duration_sec <= 0:
        print("Error: Clip duration must be positive.", file=sys.stderr, flush=True)
        sys.exit(1)

    # 1. Resolve crop parameters
    video_w, video_h = get_video_resolution(video_path)
    
    crop_w = args.crop_w
    crop_h = args.crop_h
    crop_x = args.crop_x
    crop_y = args.crop_y

    # If crop width/height are not set, calculate default 9:16 vertical crop bounds
    if crop_w <= 0 or crop_h <= 0:
        if video_w / video_h > 9 / 16:
            # Landscape video: Crop height is video height, crop width is 9/16 of height
            crop_h = video_h
            crop_w = int(round(video_h * 9 / 16))
        else:
            # Already portrait or narrower: Keep original dimensions
            crop_w = video_w
            crop_h = video_h

    # Align crop dimensions to even numbers (FFmpeg requirement for many codecs)
    crop_w = (crop_w // 2) * 2
    crop_h = (crop_h // 2) * 2

    if crop_x < 0:
        crop_x = int(round((video_w - crop_w) / 2))
    if crop_y < 0:
        crop_y = int(round((video_h - crop_h) / 2))

    # Clamp crop parameters to video boundaries
    crop_x = max(0, min(video_w - crop_w, crop_x))
    crop_y = max(0, min(video_h - crop_h, crop_y))

    # 2. Compile subtitles if requested
    temp_ass_path = None
    subtitles_filter = ""
    
    if args.words_json and os.path.exists(args.words_json):
        try:
            with open(args.words_json, "r", encoding="utf-8") as handle:
                data = json.load(handle)
            
            # Words can be top-level or nested under segments (transcriber.py output)
            words = []
            if isinstance(data, list):
                words = data
            elif isinstance(data, dict):
                if "segments" in data:
                    for seg in data["segments"]:
                        words.extend(seg.get("words", []))
                elif "words" in data:
                    words = data["words"]

            if words:
                # Create a temporary ASS file in the output directory to prevent cross-drive/volume access issues in FFmpeg
                out_dir = os.path.dirname(os.path.abspath(output_path))
                os.makedirs(out_dir, exist_ok=True)
                
                with tempfile.NamedTemporaryFile(
                    suffix=".ass", dir=out_dir, delete=False
                ) as tmp_file:
                    temp_ass_path = tmp_file.name

                generate_ass_subtitles(words, start_ms, end_ms, temp_ass_path)
                
                escaped_ass = escape_subtitle_path(temp_ass_path)
                subtitles_filter = f",subtitles='{escaped_ass}'"
                print(f"Generated subtitles file at: {temp_ass_path}", file=sys.stderr, flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"Warning: Failed to compile subtitles: {exc}", file=sys.stderr, flush=True)

    # 3. Assemble FFmpeg video filter
    # Trim seeks first, then applies crop, then burns in subtitles, then scales to standard 1080x1920
    video_filter = f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y}{subtitles_filter},scale=1080:1920"

    # FFmpeg command structure
    # Use fast seeking (-ss before -i)
    start_sec = start_ms / 1000.0
    command = [
        "ffmpeg",
        "-y",
        "-ss", f"{start_sec:.3f}",
        "-t", f"{duration_sec:.3f}",
        "-i", video_path,
        "-vf", video_filter,
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "20",
        "-c:a", "aac",
        "-b:a", "192k",
        output_path,
    ]

    print(f"Running FFmpeg: {' '.join(command)}", file=sys.stderr, flush=True)

    # 4. Spawning FFmpeg and tracking progress
    try:
        # We parse stderr line-by-line. FFmpeg prints stats to stderr.
        process = subprocess.Popen(
            command,
            stderr=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )

        time_regex = re.compile(r"time=(\d+):(\d+):(\d+)\.(\d+)")
        
        while True:
            line = process.stderr.readline() if process.stderr else ""
            if not line:
                break
            
            # Look for time=HH:MM:SS.cs progress indicators
            match = time_regex.search(line)
            if match:
                hours = int(match.group(1))
                minutes = int(match.group(2))
                seconds = int(match.group(3))
                centiseconds = int(match.group(4))
                
                current_sec = (hours * 3600) + (minutes * 60) + seconds + (centiseconds / 100.0)
                
                percent = int((current_sec / duration_sec) * 100)
                percent = min(100, max(0, percent))
                
                print(f"PROGRESS: {percent}", file=sys.stderr, flush=True)

        process.wait()

        if process.returncode != 0:
            raise subprocess.CalledProcessError(process.returncode, command)

        print(f"Successfully exported clip to: {output_path}", file=sys.stderr, flush=True)

    except Exception as exc:
        print(f"Error rendering video clip: {exc}", file=sys.stderr, flush=True)
        sys.exit(1)
    finally:
        # Clean up temporary ASS file
        if temp_ass_path and os.path.exists(temp_ass_path):
            try:
                os.remove(temp_ass_path)
            except Exception as exc:  # noqa: BLE001
                print(f"Warning: Failed to clean up temp ASS file: {exc}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
