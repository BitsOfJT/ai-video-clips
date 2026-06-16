"""
Unit tests for the audio extraction utility.

Tests validate that the FFmpeg command line is constructed correctly
and that error handling works as expected. External FFmpeg calls are
mocked to avoid depending on system availability in CI.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# We import the module under test via its package path.
# This requires python/ to be importable (e.g., PYTHONPATH adjusted).
from utils.audio_extractor import extract_audio  # type: ignore[import-untyped]


class TestExtractAudio:
    """Tests for the extract_audio function."""

    @patch("utils.audio_extractor.subprocess.run")
    def test_constructs_correct_ffmpeg_command(self, mock_run: MagicMock, tmp_path: Path) -> None:
        """Verify the FFmpeg command array is built with expected arguments."""
        video_file = tmp_path / "input_video.mp4"
        video_file.write_text("fake video data")

        result = extract_audio(str(video_file))

        # Verify subprocess.run was called once with the correct command.
        mock_run.assert_called_once()
        args, kwargs = mock_run.call_args
        command = args[0]

        # Verify the full command structure.
        assert command[0] == "ffmpeg"
        assert "-i" in command
        i_index = command.index("-i")
        assert command[i_index + 1] == str(video_file.resolve())
        assert "-vn" in command
        assert "-acodec" in command
        assert command[command.index("-acodec") + 1] == "pcm_s16le"
        assert "-ar" in command
        assert command[command.index("-ar") + 1] == "16000"
        assert "-ac" in command
        assert command[command.index("-ac") + 1] == "1"
        assert "-y" in command

        # Verify the output path matches expectations.
        expected_output = str(video_file.parent / f"{video_file.stem}_audio.wav")
        assert result == expected_output

    @patch("utils.audio_extractor.subprocess.run")
    def test_uses_custom_output_dir(self, mock_run: MagicMock, tmp_path: Path) -> None:
        """Verify that an explicit output_dir redirects the WAV file."""
        video_file = tmp_path / "video.mov"
        video_file.write_text("fake")
        output_dir = tmp_path / "custom_output"

        result = extract_audio(str(video_file), output_dir=str(output_dir))

        mock_run.assert_called_once()
        expected_output = str((output_dir / "video_audio.wav").resolve())
        assert result == expected_output

    @patch("utils.audio_extractor.subprocess.run")
    def test_creates_output_dir_if_missing(self, mock_run: MagicMock, tmp_path: Path) -> None:
        """Verify that the output directory is auto-created."""
        video_file = tmp_path / "test.avi"
        video_file.write_text("fake")
        output_dir = tmp_path / "nonexistent" / "deep" / "path"

        extract_audio(str(video_file), output_dir=str(output_dir))

        mock_run.assert_called_once()
        assert output_dir.exists()

    def test_raises_on_missing_input(self, tmp_path: Path) -> None:
        """Verify FileNotFoundError is raised for a nonexistent input file."""
        fake_path = str(tmp_path / "missing.mp4")
        with pytest.raises(FileNotFoundError, match="Video file not found"):
            extract_audio(fake_path)

    @patch("utils.audio_extractor.subprocess.run")
    def test_raises_on_ffmpeg_failure(self, mock_run: MagicMock, tmp_path: Path) -> None:
        """Verify RuntimeError when FFmpeg exits with a non-zero status."""
        video_file = tmp_path / "corrupt.mp4"
        video_file.write_text("garbage")

        # Simulate a CalledProcessError with stderr output.
        mock_run.side_effect = subprocess.CalledProcessError(
            returncode=1,
            cmd=["ffmpeg", ...],
            stderr="Invalid data found when processing input",
        )

        with pytest.raises(RuntimeError, match="FFmpeg failed to extract audio"):
            extract_audio(str(video_file))

    @patch("utils.audio_extractor.subprocess.run")
    def test_passes_check_true_and_capture_output(self, mock_run: MagicMock, tmp_path: Path) -> None:
        """Verify subprocess.run is called with check=True and capture_output=True."""
        video_file = tmp_path / "valid.mp4"
        video_file.write_text("fake")

        extract_audio(str(video_file))

        mock_run.assert_called_once()
        _args, kwargs = mock_run.call_args
        assert kwargs.get("check") is True
        assert kwargs.get("capture_output") is True
        assert kwargs.get("text") is True

    @patch("utils.audio_extractor.subprocess.run")
    def test_handles_unicode_filename(self, mock_run: MagicMock, tmp_path: Path) -> None:
        """Verify the function works with filenames containing Unicode characters."""
        video_file = tmp_path / "видео.mp4"
        video_file.write_text("fake")

        result = extract_audio(str(video_file))

        mock_run.assert_called_once()
        # The output should contain the Unicode stem.
        assert "_audio.wav" in result
        assert "видео" in result
