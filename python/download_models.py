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

import shutil
import sys
from pathlib import Path

from faster_whisper import download_model


def get_repo_root() -> Path:
    """Return the repository root, i.e. the parent of the python/ directory."""
    # __file__ lives in python/, so its parent.parent is the repo root.
    return Path(__file__).resolve().parent.parent


def download_base_model() -> None:
    """Download faster-whisper-base and report the number of files saved."""
    repo_root = get_repo_root()
    download_root = repo_root / "assets" / "models" / "whisper-base"

    # Ensure the destination directory exists before asking faster-whisper to
    # write into it.
    download_root.mkdir(parents=True, exist_ok=True)

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
