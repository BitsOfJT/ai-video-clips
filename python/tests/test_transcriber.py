"""
Unit tests for the transcriber CLI entrypoint.

Tests validate argument parsing and the ffprobe-based duration extraction
utility.  The heavy transcription logic itself (faster-whisper) is not tested
here because it requires the model weights and GPU/CPU resources; instead we
focus on the orchestration layer that the Electron main process depends on.
"""

from __future__ import annotations

import subprocess
from unittest.mock import MagicMock, patch

import pytest

from transcriber import get_video_duration, parse_args  # type: ignore[import-untyped]


class TestParseArgs:
    """Tests for command-line argument parsing."""

    def test_requires_video_path(self) -> None:
        """The --video-path argument is required."""
        with pytest.raises(SystemExit):
            parse_args()

    def test_requires_model_dir(self) -> None:
        """The --model-dir argument is required."""
        with pytest.raises(SystemExit):
            parse_args()

    def test_requires_output_json(self) -> None:
        """The --output-json argument is required."""
        with pytest.raises(SystemExit):
            parse_args()

    @patch("sys.argv", ["transcriber.py", "--video-path", "/videos/test.mp4", "--model-dir", "/models/base", "--output-json", "/tmp/output.json"])
    def test_parses_all_required_args(self) -> None:
        """All three required arguments are parsed correctly."""
        args = parse_args()
        assert args.video_path == "/videos/test.mp4"
        assert args.model_dir == "/models/base"
        assert args.output_json == "/tmp/output.json"
        assert args.extract_audio is False

    @patch("sys.argv", [
        "transcriber.py",
        "--video-path", "/videos/test.mp4",
        "--model-dir", "/models/base",
        "--output-json", "/tmp/output.json",
        "--extract-audio",
    ])
    def test_parses_extract_audio_flag(self) -> None:
        """The --extract-audio flag is parsed as True when present."""
        args = parse_args()
        assert args.extract_audio is True

    @patch("sys.argv", [
        "transcriber.py",
        "--video-path", "/videos/test.mov",
        "--model-dir", "/models/small",
        "--output-json", "/tmp/result.json",
    ])
    def test_parses_different_model_and_format(self) -> None:
        """Different video paths, model dirs, and output paths work."""
        args = parse_args()
        assert args.video_path == "/videos/test.mov"
        assert args.model_dir == "/models/small"
        assert args.output_json == "/tmp/result.json"

    @patch("sys.argv", [
        "transcriber.py",
        "--video-path", "/videos/test with spaces.mp4",
        "--model-dir", "/models/base model",
        "--output-json", "/tmp/output file.json",
    ])
    def test_handles_paths_with_spaces(self) -> None:
        """Paths containing spaces are preserved correctly (shell quoting handles them)."""
        args = parse_args()
        assert args.video_path == "/videos/test with spaces.mp4"
        assert args.model_dir == "/models/base model"
        assert args.output_json == "/tmp/output file.json"


class TestGetVideoDuration:
    """Tests for the ffprobe-based video duration extraction."""

    @patch("transcriber.subprocess.run")
    def test_returns_duration_on_success(self, mock_run: MagicMock) -> None:
        """When ffprobe succeeds, the duration float is returned."""
        mock_run.return_value = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout="125.5\n",
            stderr="",
        )

        duration = get_video_duration("/some/video.mp4")

        assert duration == 125.5

    @patch("transcriber.subprocess.run")
    def test_constructs_correct_ffprobe_command(self, mock_run: MagicMock) -> None:
        """Verify the ffprobe command is built with the expected arguments."""
        mock_run.return_value = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout="30.0\n",
            stderr="",
        )

        get_video_duration("/path/to/video.mp4")

        mock_run.assert_called_once()
        args, kwargs = mock_run.call_args
        command = args[0]

        assert command[0] == "ffprobe"
        assert "-v" in command
        assert command[command.index("-v") + 1] == "error"
        assert "-show_entries" in command
        assert command[command.index("-show_entries") + 1] == "format=duration"
        assert "-of" in command
        # The output format includes nokey=1 to make parsing easier.
        assert "nokey=1" in command[command.index("-of") + 1]
        assert command[-1] == "/path/to/video.mp4"
        assert kwargs.get("check") is True
        assert kwargs.get("capture_output") is True

    @patch("transcriber.subprocess.run")
    def test_returns_zero_on_ffprobe_failure(self, mock_run: MagicMock) -> None:
        """When ffprobe fails, return 0.0 as a safe fallback."""
        mock_run.side_effect = subprocess.CalledProcessError(
            returncode=1,
            cmd=["ffprobe", "..."],
            stderr="ffprobe not found",
        )

        duration = get_video_duration("/some/video.mp4")
        assert duration == 0.0

    @patch("transcriber.subprocess.run")
    def test_returns_zero_on_ffprobe_parse_error(self, mock_run: MagicMock) -> None:
        """When ffprobe output cannot be parsed as a float, return 0.0."""
        mock_run.return_value = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout="N/A\n",
            stderr="",
        )

        duration = get_video_duration("/some/video.mp4")
        assert duration == 0.0

    @patch("transcriber.subprocess.run")
    def test_returns_zero_on_exception(self, mock_run: MagicMock) -> None:
        """Any exception (e.g., FileNotFoundError for ffprobe itself) returns 0.0."""
        mock_run.side_effect = FileNotFoundError("ffprobe not installed")

        duration = get_video_duration("/some/video.mp4")
        assert duration == 0.0

    @patch("transcriber.subprocess.run")
    def test_strips_whitespace_from_output(self, mock_run: MagicMock) -> None:
        """Trailing whitespace/newlines in ffprobe output are handled."""
        mock_run.return_value = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout="  90.0  \n",
            stderr="",
        )

        duration = get_video_duration("/some/video.mp4")
        assert duration == 90.0
