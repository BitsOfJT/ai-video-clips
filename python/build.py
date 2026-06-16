#!/usr/bin/env python3
"""
PyInstaller builder for the transcription backend.

Usage:
    python python/build.py

Produces a self-contained executable:
    - macOS: assets/bin/transcriber
    - Windows: assets/bin/transcriber.exe

The bundled model directory is included via PyInstaller --add-data so the
executable can transcribe without relying on an external model download.
"""

from __future__ import annotations

import platform
import shutil
import subprocess
import sys
from pathlib import Path


def get_repo_root() -> Path:
    """Return the repository root (parent of the python/ directory)."""
    return Path(__file__).resolve().parent.parent


def build_transcriber() -> None:
    """Run PyInstaller to bundle transcriber.py with the whisper model."""
    repo_root = get_repo_root()
    python_dir = repo_root / "python"
    source_script = python_dir / "transcriber.py"
    output_dir = repo_root / "assets" / "bin"
    model_dir = repo_root / "assets" / "models" / "whisper-base"

    if not source_script.exists():
        print(f"Source script not found: {source_script}", file=sys.stderr)
        sys.exit(1)

    # PyInstaller --add-data uses a platform-specific separator.
    separator = ";" if platform.system() == "Windows" else ":"

    if not model_dir.exists():
        print(
            f"Model directory not found: {model_dir}. "
            "Run 'python python/download_models.py' first.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Ensure the destination directory exists; PyInstaller will place its
    # build artifacts inside as well.
    output_dir.mkdir(parents=True, exist_ok=True)

    # PyInstaller command. We use --onefile so the renderer spawns a single
    # executable, and --distpath points at assets/bin.
    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--onefile",
        "--noconfirm",
        "--clean",
        "--name", "transcriber",
        "--distpath", str(output_dir),
        "--workpath", str(output_dir / "_build"),
        "--specpath", str(output_dir / "_spec"),
        "--add-data", f"{model_dir}{separator}assets/models/whisper-base",
        str(source_script),
    ]

    print(f"Building transcriber with PyInstaller for {platform.system()}...")
    print(f"Output directory: {output_dir}")

    try:
        subprocess.run(command, check=True)
    except subprocess.CalledProcessError as exc:
        print(f"PyInstaller build failed: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        # Remove PyInstaller intermediate build directories so they do not
        # accumulate in assets/bin/.
        for intermediate in (output_dir / "_build", output_dir / "_spec"):
            if intermediate.exists():
                shutil.rmtree(intermediate)

    executable_name = "transcriber.exe" if platform.system() == "Windows" else "transcriber"
    executable_path = output_dir / executable_name

    if not executable_path.exists():
        print(f"Expected executable not found: {executable_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Build succeeded: {executable_path}")


if __name__ == "__main__":
    build_transcriber()
