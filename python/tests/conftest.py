"""
pytest configuration:
  - Adds the project's python/ directory to sys.path so that tests can import
    from transcriber.py and utils.audio_extractor without needing PYTHONPATH.
  - Mocks the faster_whisper module because its C extensions are not installed
    in CI / test environments.  The transcriber unit tests only test the
    orchestration layer (argparse, ffprobe invocation), so they never actually
    call WhisperModel.
"""
import sys
from pathlib import Path
from unittest.mock import MagicMock

# Add the project's python/ directory to the Python import path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Mock faster_whisper before any test module imports transcriber.py.
# This prevents ImportError when transcriber.py tries to `from faster_whisper import WhisperModel`.
# The mock module is replaced only for the duration of the test session.
import unittest.mock as um  # noqa: E402 (import after sys.path manipulation)

faster_whisper_mock = MagicMock()
faster_whisper_mock.WhisperModel = MagicMock()
sys.modules["faster_whisper"] = faster_whisper_mock
