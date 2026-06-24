"""
Unit tests for the video editor CLI.

Tests validate time formatting, subtitle generation, path-escaping, and FFmpeg command construction.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Adjust PYTHONPATH to import editor.py directly
import sys
sys.path.append(str(Path(__file__).resolve().parent.parent))
from editor import ms_to_ass_time, escape_subtitle_path, generate_ass_subtitles  # type: ignore[import-untyped]


class TestEditorUtilities:
    """Tests for individual utility functions in editor.py."""

    @pytest.mark.parametrize(
        "ms,expected",
        [
            (0, "0:00:00.00"),
            (500, "0:00:00.50"),
            (1000, "0:00:01.00"),
            (61230, "0:01:01.23"),
            (3661230, "1:01:01.23"),
            (-100, "0:00:00.00"),
        ],
    )
    def test_ms_to_ass_time(self, ms: int, expected: str) -> None:
        """Verify milliseconds are correctly formatted into ASS timestamps."""
        assert ms_to_ass_time(ms) == expected

    @pytest.mark.parametrize(
        "path_str,expected",
        [
            ("C:\\path\\to\\sub.ass", "filename='C:/path/to/sub.ass'"),
            ("/usr/local/share/sub.ass", "filename='/usr/local/share/sub.ass'"),
            ("path'with'quote.ass", "filename='path''with''quote.ass'"),
        ],
    )
    def test_escape_subtitle_path(self, path_str: str, expected: str) -> None:
        """Verify file paths are correctly escaped for FFmpeg subtitles filter."""
        assert escape_subtitle_path(path_str) == expected


class TestSubtitleGeneration:
    """Tests for the ASS subtitle compilation logic."""

    def test_generates_valid_ass_subtitles(self, tmp_path: Path) -> None:
        """Verify that words are grouped into lines and written with correct ASS syntax."""
        words = [
            {"word": " Hello", "start": 1.0, "end": 1.5},
            {"word": " world", "start": 1.6, "end": 2.0},
            {"word": " this", "start": 2.1, "end": 2.5},
            {"word": " is", "start": 3.5, "end": 3.8}, # Gap of 1.0s (>600ms) - should split
            {"word": " a", "start": 3.9, "end": 4.1},
            {"word": " test", "start": 4.2, "end": 4.5},
        ]
        
        output_file = tmp_path / "subtitles.ass"
        
        # Clip from 1.0s (1000ms) to 5.0s (5000ms)
        generate_ass_subtitles(words, start_ms=1000, end_ms=5000, output_ass_path=str(output_file))
        
        assert output_file.exists()
        content = output_file.read_text(encoding="utf-8")
        
        # Verify headers exist
        assert "[Script Info]" in content
        assert "PlayResX: 1080" in content
        assert "PlayResY: 1920" in content
        assert "[V4+ Styles]" in content
        assert "Style: Default" in content
        
        # Verify dialogue events
        assert "[Events]" in content
        lines = [line for line in content.splitlines() if line.startswith("Dialogue:")]
        
        # Should split into two groups because of the 1.0s gap between 'this' and 'is'
        assert len(lines) == 2
        
        # Line 1: 'Hello', 'world', 'this'
        # Start time should be relative to 1000ms: 1000-1000 = 0 -> 0:00:00.00
        # End time should be relative to 1000ms: 2500-1000 = 1500 -> 0:00:01.50
        assert "Dialogue: 0,0:00:00.00,0:00:01.50" in lines[0]
        # Word 1: ' Hello' (start 0, next_start 60) -> \k60
        # Word 2: ' world' (start 60, next_start 110) -> \k50
        # Word 3: ' this' (start 110, end 150) -> \k40
        assert "{\\k60} Hello{\\k50} world{\\k40} this" in lines[0]
        
        # Line 2: 'is', 'a', 'test'
        # Start time relative to 1000ms: 3500-1000 = 2500 -> 0:00:02.50
        # End time relative to 1000ms: 4500-1000 = 3500 -> 0:00:03.50
        assert "Dialogue: 0,0:00:02.50,0:00:03.50" in lines[1]
