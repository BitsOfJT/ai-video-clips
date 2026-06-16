# ai-video-clips

**AI-powered desktop video clipper for short-form content.** Import videos, transcribe them locally with Whisper, and clip highlights — all on your machine with no cloud dependency.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind v4 + shadcn/ui
- **Desktop Shell**: Electron 35 (context isolation, secure preload bridge)
- **State Management**: Zustand
- **Database**: SQLite via better-sqlite3
- **Transcription**: faster-whisper (local, CPU, int8 quantized)
- **Audio Extraction**: FFmpeg
- **Build Tooling**: Vite + vite-plugin-electron + electron-builder
- **Testing**: Vitest (TypeScript), pytest (Python), E2E smoke test

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- **Python** 3.10+ (for model download, transcriber build, and Python tests)
- **FFmpeg** installed and available on `PATH` (used for audio extraction and video probing)
- **PyInstaller** (optional, only needed if building the standalone transcriber binary)

## Installation

```bash
# 1. Clone the repository
git clone <repo-url>
cd ai-video-clips

# 2. Install Node.js dependencies
npm install

# 3. Download the faster-whisper base model
npm run download:models

# 4. Build the transcriber binary (PyInstaller)
npm run build:python
```

## Development

```bash
npm run dev
```

Starts Vite with HMR and launches the Electron app. The renderer is served from the Vite dev server; the main process is compiled on the fly.

## Build

```bash
npm run build
```

Runs TypeScript check, Vite production build, and electron-builder to produce a distributable (`.dmg` on macOS, `.exe` installer on Windows).

## Testing

```bash
npm run test          # Vitest unit tests (main process utilities)
npm run test:e2e      # E2E smoke test: generates a test video and runs the transcriber
npm run test:python   # Pytest for Python utilities (audio extractor, transcriber)
```

## Lint & Typecheck

```bash
npm run lint          # ESLint (typescript-eslint + react-hooks + react-refresh)
npm run typecheck     # TypeScript strict check (no emit)
```

## Project Structure

```
ai-video-clips/
├── electron/
│   ├── main.ts          # Main process: window, DB, IPC, ffprobe, transcription
│   └── preload.ts       # Secure contextBridge (whitelisted IPC channels)
├── src/
│   ├── constants.ts     # IPC channels, extensions, window sizes, CSP
│   ├── types/           # Shared TypeScript types (IPC, Project, etc.)
│   └── renderer/        # React frontend (Tailwind v4 + shadcn/ui)
├── python/
│   ├── transcriber.py   # faster-whisper CLI entrypoint
│   ├── audio_extractor.py  # FFmpeg-based audio extraction
│   ├── build.py         # PyInstaller builder
│   ├── download_models.py  # Model downloader
│   └── tests/           # Pytest suite
├── assets/
│   ├── bin/             # PyInstaller-built transcriber executable
│   └── models/          # faster-whisper model files
├── tests/unit/          # Vitest unit tests
├── scripts/             # E2E smoke test script
├── vitest.config.ts     # Vitest configuration
└── vite.config.ts       # Vite + plugin-electron configuration
```

## Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Electron + Vite + React scaffold, DB, IPC, video probing | ✅ Complete |
| 2 | Transcription pipeline (faster-whisper, audio extraction, progress streaming) | ✅ Complete |
| 3+ | Clip detection, editing, export, UI polish | 🔜 Coming |
