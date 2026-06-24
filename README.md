# AI Video Clipper

**AI-powered desktop video clipper for short-form content.** Import long-form videos, transcribe locally with Whisper, analyze clips with AI against your creative brief, preview ranked highlights, and export vertical 9:16 MP4s with karaoke captions — all on your machine.

## Download (end users)

Pre-built installers are published on [GitHub Releases](https://github.com/bitsofjt/ai-video-clips/releases):

| Platform | File | Notes |
|----------|------|-------|
| macOS (Apple Silicon) | `.dmg` | Unsigned — right-click the app → **Open** on first launch, or run `xattr -cr "/Applications/AI Video Clipper.app"` |
| Windows 10/11 (64-bit) | `.exe` installer | Unsigned — click **More info** → **Run anyway** if SmartScreen warns |

### Before your first clip

1. **Install Ollama** from [ollama.com](https://ollama.com) (default AI provider, fully local).
2. Pull the recommended models:
   ```bash
   ollama pull llama3.1
   ollama pull llama3.2-vision
   ```
3. Launch AI Video Clipper — the **Setup Check** screen verifies binaries, FFmpeg, and Ollama.

**Optional:** Switch to **Gemini** in Settings and paste a free API key from [Google AI Studio](https://aistudio.google.com/apikey) instead of running Ollama.

### Typical workflow

1. Drop a video → metadata is probed automatically
2. **Transcribe** (local faster-whisper, offline)
3. Enter a **creative brief** + video type → **Analyze** (Ollama or Gemini)
4. Browse ranked clips → preview → adjust trim/crop
5. **Export** 1080×1920 MP4 ready for YouTube Shorts / TikTok

---

## Development

### Prerequisites

- **Node.js** ≥ 18, **npm** ≥ 9
- **Python** 3.10+ (model download, PyInstaller builds, pytest)
- **FFmpeg** on `PATH` (dev only — production builds bundle FFmpeg)
- **PyInstaller** (installed via `python/requirements.txt`)

### Setup

```bash
git clone <repo-url>
cd ai-video-clips
npm install
npm run download:models    # ~150 MB Whisper base model
npm run build:python       # PyInstaller → assets/bin/transcriber + editor
npm run dev
```

### Commands

```bash
npm run dev            # Electron + Vite HMR
npm run build          # TypeScript + Vite + electron-builder (needs assets first)
npm run build:release  # download models + build python + download ffmpeg + package
npm run typecheck
npm run lint
npm run test           # Vitest (main-process utils)
npm run test:python    # pytest
npm run test:e2e       # transcriber smoke test (needs built binary + FFmpeg)
npm run test:editor    # editor smoke test (needs built binary + FFmpeg)
```

### Releasing

Push a version tag to trigger the GitHub Actions release workflow:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow builds on **macOS (arm64)** and **Windows (x64)**, runs tests, bundles FFmpeg + Whisper + Python binaries, and uploads installers to GitHub Releases.

See [RELEASE_NOTES.md](./RELEASE_NOTES.md) for v1.0.0 install notes.

---

## Tech Stack

- **Frontend:** React 19 + TypeScript + Tailwind v4 + shadcn/ui
- **Desktop:** Electron 35 (context isolation, typed IPC)
- **State:** Zustand · **Database:** SQLite (better-sqlite3)
- **Transcription:** faster-whisper (local, bundled)
- **AI analysis:** Ollama (default) or Gemini (opt-in) — main process, encrypted settings
- **Export:** FFmpeg + PyInstaller editor binary (trim, 9:16 crop, ASS karaoke burn-in)
- **Testing:** Vitest, pytest, E2E smoke scripts

## Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Scaffold (Electron, DB, IPC, import) | Complete |
| 2 | Transcription pipeline | Complete |
| 3 | Creative brief + AI analysis | Complete |
| 4 | Ranking, thumbnails, preview | Complete |
| 5 | Auto-edit & export | Complete |
| 6 | Packaging, health checks, CI/CD | Complete |

Full product spec: [plan.md](./plan.md) · Agent guide: [AGENTS.md](./AGENTS.md)
