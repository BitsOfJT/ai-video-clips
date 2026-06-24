# Release Notes — v1.0.0

First public release of **AI Video Clipper** — a local-first desktop app for finding and exporting short-form clips from long videos.

## What's included

- Drag-and-drop video import with metadata probing
- Offline transcription (faster-whisper, word-level timestamps)
- AI clip analysis driven by your creative brief (Ollama default, Gemini optional)
- Ranked clip grid with thumbnails and in-app preview
- Manual trim/crop editor + 9:16 export with karaoke captions
- Bundled FFmpeg, Whisper model, and Python binaries (no separate Python install needed)

## Install

Download the installer for your platform from this release:

- **macOS (Apple Silicon):** `AI Video Clipper-1.0.0-arm64.dmg`
- **Windows (64-bit):** `AI Video Clipper Setup 1.0.0.exe`

### Unsigned builds (early adopters)

These installers are **not code-signed**.

**macOS:** After installing, if Gatekeeper blocks the app:
1. Right-click **AI Video Clipper** in Applications → **Open**, or
2. Run: `xattr -cr "/Applications/AI Video Clipper.app"`

**Windows:** If SmartScreen shows "Windows protected your PC":
1. Click **More info**
2. Click **Run anyway**

## Before first use

1. Install [Ollama](https://ollama.com)
2. Pull models:
   ```bash
   ollama pull llama3.1
   ollama pull llama3.2-vision
   ```
3. Open AI Video Clipper — complete the **Setup Check** screen

Alternatively, open **Settings** → switch to **Gemini** → paste an API key from [Google AI Studio](https://aistudio.google.com/apikey).

## Known limitations

- macOS build targets **Apple Silicon (arm64)** only in v1.0.0
- Re-running analysis replaces clips and clears manual crop edits
- Source videos must remain at their original path (no re-link flow yet)
- Audio/visual ranking signals are deferred; v1 ranks on AI scores only

## System requirements

- **macOS:** 12+ on Apple Silicon, ~2 GB free disk for app + models
- **Windows:** 10/11 64-bit, ~2 GB free disk
- **RAM:** 8 GB minimum; 16 GB recommended for Ollama vision models
