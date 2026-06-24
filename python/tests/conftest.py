"""Shared pytest fixtures for python/tests."""

from __future__ import annotations

from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def mock_ffmpeg_tools_on_path():
    """Unit tests mock subprocess; pretend ffmpeg/ffprobe exist on PATH."""

    def which_side_effect(cmd: str) -> str | None:
        if cmd in ("ffmpeg", "ffprobe"):
            return f"/usr/bin/{cmd}"
        return None

    with (
        patch("transcriber.shutil.which", side_effect=which_side_effect),
        patch("utils.audio_extractor.shutil.which", side_effect=which_side_effect),
    ):
        yield
