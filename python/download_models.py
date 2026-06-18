#!/usr/bin/env python3
"""
Download the Systran/faster-whisper-base model to the bundled assets path.

Usage:
    python python/download_models.py

The model files are written to ../assets/models/whisper-base/ relative to this
script so that the Electron app and PyInstaller bundle can find them at a
stable, predictable path.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

# Runtime files required by faster_whisper.WhisperModel for the base model.
# Keep these as a module-level constant so the idempotency check is self-contained
# and does not need to import faster_whisper.
REQUIRED_MODEL_FILES = ("config.json", "model.bin", "tokenizer.json", "vocabulary.txt")


def get_repo_root() -> Path:
    """Return the repository root, i.e. the parent of the python/ directory."""
    # __file__ lives in python/, so its parent.parent is the repo root.
    return Path(__file__).resolve().parent.parent


def _model_files_look_valid(model_dir: Path) -> bool:
    """Check whether the required runtime model files exist and look valid.

    Validation is intentionally lightweight: missing files or a malformed
    config.json are treated as invalid so the download will run again.
    """
    for filename in REQUIRED_MODEL_FILES:
        file_path = model_dir / filename
        if not file_path.is_file() or file_path.stat().st_size == 0:
            return False

    # Confirm config.json is at least parseable JSON (the simplest integrity
    # check that does not require faster_whisper).
    config_path = model_dir / "config.json"
    try:
        with config_path.open("r", encoding="utf-8") as config_file:
            json.load(config_file)
    except (OSError, json.JSONDecodeError):
        return False

    return True


def download_base_model() -> None:
    """Download faster-whisper-base if needed and report status."""
    repo_root = get_repo_root()
    download_root = repo_root / "assets" / "models" / "whisper-base"

    # Ensure the destination directory exists before checking contents or
    # asking faster-whisper to write into it.
    download_root.mkdir(parents=True, exist_ok=True)

    if _model_files_look_valid(download_root):
        print(
            f"Model files already present at {download_root}; skipping download."
        )
        return

    # Import only when a download is actually needed. This keeps the script usable
    # during packaging (where faster_whisper may not be installed) as long as the
    # bundled model files are already present.
    from faster_whisper import download_model

    # Use faster_whisper's helper to download the model files directly into a
    # flat directory layout (model.bin, config.json, tokenizer.json, etc.).
    # A flat layout is required because WhisperModel(model_size_or_path=...)
    # looks for model.bin at the provided path.
    download_model(
        size_or_id="base",
        output_dir=str(download_root),
    )

    # faster-whisper leaves Hugging Face cache artifacts in the same directory
    # (subdirectories .cache and .locks). Remove them so the bundled model only
    # contains the runtime files needed by WhisperModel.
    for artifact in (".cache", ".locks", "CACHEDIR.TAG"):
        artifact_path = download_root / artifact
        if artifact_path.is_dir():
            shutil.rmtree(artifact_path)
        elif artifact_path.is_file():
            artifact_path.unlink()

    # Count files as a sanity check.
    downloaded_files = [
        entry
        for entry in download_root.iterdir()
        if entry.is_file()
    ]

    print(
        f"Successfully downloaded Systran/faster-whisper-base to {download_root} "
        f"({len(downloaded_files)} files)."
    )


if __name__ == "__main__":
    try:
        download_base_model()
    except Exception as exc:  # noqa: BLE001
        print(f"Error downloading model: {exc}", file=sys.stderr)
        sys.exit(1)
