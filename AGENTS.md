# AGENTS.md — ai-video-clips

## Project State
- **Phase 1 scaffold is LIVE.** Electron + Vite + React + TypeScript + Tailwind v4 + shadcn/ui + Zustand + better-sqlite3.
- **Phase 2 (Transcription Pipeline) is COMPLETE.** faster-whisper integration, audio extraction, progress streaming, PyInstaller build.
- **Phase 3 (Creative Brief & AI Analysis) is COMPLETE.** Sentence/pause-boundary chunking, pluggable AI providers (Ollama default + Gemini), two-pass text→vision scoring, encrypted settings, clip grid. **Chunking + analysis run in the Electron main process (TypeScript), not Python** — see `electron/analysis/`. **Ollama is the default provider** (local/offline, no API key); Gemini is optional opt-in. AI network calls must originate from the main process (renderer CSP is `connect-src 'self'`).
- The canonical spec is [`plan.md`](./plan.md). Read it before making architectural decisions.

## Quick Commands
```bash
npm run dev         # Start Electron in dev mode (Vite HMR + plugin-electron)
npm run build       # Full pipeline: tsc + vite build + electron-builder
npm run typecheck   # TypeScript check only (strict, ES2022, bundler resolution)
npm run lint        # ESLint via flat config (typescript-eslint + react-hooks + react-refresh)
npm run test        # Vitest unit tests (main process utils)
npm run test:e2e    # Smoke test: generates test video and runs transcriber
npm run test:python # Pytest for Python utilities
```

## Architecture
- **Electron Main** (`electron/main.ts`): Window mgmt, DB init (`better-sqlite3`), IPC handlers, FFmpeg `ffprobe` spawning, transcription child process management.
- **Preload** (`electron/preload.ts`): Secure `contextBridge` exposing only whitelisted IPC channels via `window.electronAPI`. Also exposes one-way listeners for transcription progress streaming.
- **Renderer** (`src/renderer/`): React frontend. Tailwind v4 + shadcn/ui. Dark theme default (`class="dark"` on `<html>`).
- **Python Backend** (`python/`): `transcriber.py` (faster-whisper entrypoint), `utils/audio_extractor.py` (FFmpeg-based WAV extraction), `build.py` (PyInstaller builder), `download_models.py` (model downloader).
- **Bundled Assets**: `assets/models/whisper-base/` (faster-whisper model files), `assets/bin/transcriber` (PyInstaller-built standalone executable).
- **IPC Channels** (single source of truth in `src/constants.ts`):
  - `video:probeMetadata` — runs `ffprobe`, returns `{ durationSec, width, height, fps }`
  - `db:getProjects` / `db:createProject` — SQLite via `better-sqlite3`
  - `transcription:start` — spawns transcriber child process
  - `transcription:progress` — one-way push from main to renderer (stderr parsing)
  - `transcription:complete` — signals transcription finished
  - `transcription:error` — signals transcription failure
- **DB Location**: `app.getPath('userData')` + `database.sqlite`. Auto-created on first launch.

## Key Gotchas

### ESM Only — No `__dirname` / `__filename`
- `package.json` has `"type": "module"`. Both Electron and Vite are ESM.
- In `electron/main.ts`, reconstruct `__dirname` manually:
  ```typescript
  import { fileURLToPath } from "node:url";
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  ```
- Vite internally provides `__dirname` in `vite.config.ts`, but avoid relying on it in custom ESM scripts.

### Tailwind v4 (Not v3)
- Uses `@import "tailwindcss"` + `@theme { ... }` in `src/renderer/index.css`.
- `tailwind.config.js` does **NOT** exist (v4 ignores it). `components.json` has no `tailwind.config` reference.
- PostCSS config: `{ '@tailwindcss/postcss': {}, autoprefixer: {} }`.

### IPC Type Safety
- Preload channel whitelist is derived from `VALID_IPC_CHANNELS` in `src/constants.ts`.
- Renderer types (`src/types/electron.d.ts`) use `ElectronChannel` union — update both sides when adding channels.
- `src/renderer/hooks/useIPC.ts` was deleted (dead code). The store has its own `invokeIPC` helper.

### Path Validation (Security)
- `video:probeMetadata` validates paths before passing to `ffprobe`:
  1. `path.isAbsolute()`
  2. Extension whitelist (`SUPPORTED_VIDEO_EXTENSIONS`)
  3. `fs.promises.access(..., R_OK)`
  4. `path.resolve()` (symlink protection via realpath resolution)
- Rate-limited: `probeInProgress` flag prevents concurrent ffprobe spawns.
- Errors are sanitized before reaching renderer (no system paths leaked).

### Electron Builder Config
- `electron-builder.yml` nests `target` under `mac:` and `win:` platform keys (NOT root level).
- `assets/.gitkeep` exists because `extraResources` references an `assets/` directory.
- `postinstall` script runs `electron-builder install-app-deps` to rebuild native modules (e.g., `better-sqlite3`).

### shadcn/ui Quirk
- `src/renderer/components/ui/button.tsx` exports `buttonVariants` alongside the component.
- ESLint config allows this via `allowExportNames: ['buttonVariants']` to prevent `react-refresh/only-export-components` warnings.

### One-Way IPC Listeners in Preload
- `electron/preload.ts` exposes `onTranscriptionProgress`, `onTranscriptionComplete`, `onTranscriptionError` via `ipcRenderer.on()` for background-job progress streaming.
- Uses named `IPC_CHANNELS` references (not array indices) to avoid silent breakage on reorder.
- Also exposes `removeAllListeners(channel)` for cleanup.

### Transcription Concurrency Guard
- `activeTranscriptions` map (`Map<string, ChildProcess>`) in `electron/main.ts` prevents concurrent transcriptions for the same project.
- Max concurrency implicitly limited by user interaction (no queue system yet).
- Child processes are killed in the `before-quit` handler to prevent orphaned processes.

### Dev/Prod Path Resolution
- `getTranscriberPath()` and `getModelPath()` in `electron/main.ts` check `process.env.VITE_DEV_SERVER_URL` to distinguish dev (relative to `__dirname`) from production (`process.resourcesPath`).
- On Windows, `.exe` is appended to the transcriber binary path.

### IPC Listener HMR Safety
- `useAppStore.ts` registers one-way listeners once via a module-level `listenersRegistered` flag to prevent duplicate listener accumulation during Vite HMR.

### Test Frameworks
- **Vitest** for TypeScript (configured in `vitest.config.ts`). Tests live in `tests/unit/`.
- **pytest** for Python. Tests live in `python/tests/`.
- **E2E smoke test** at `scripts/test-transcriber.js` — generates a synthetic test video and runs the transcriber binary end-to-end.

## Important File Map
| File | Purpose |
|------|---------|
| `vite.config.ts` | Dual entry: renderer + electron main/preload via `vite-plugin-electron` |
| `tsconfig.json` | Strict TS, includes `src` + `electron`, paths alias `@/` |
| `electron/main.ts` | All main-process code: DB, IPC, window, ffprobe, CSP |
| `electron/preload.ts` | Secure IPC bridge (whitelist + contextBridge) |
| `src/constants.ts` | IPC channels, supported extensions, window sizes, CSP string |
| `src/types/electron.d.ts` | Shared IPC types + global `Window.electronAPI` |
| `src/renderer/store/useAppStore.ts` | Zustand store: projects, import state, loading/errors |
| `src/renderer/index.css` | Tailwind v4 directives + `@theme` + CSS vars for dark mode |
| `index.html` | Renderer entry HTML; applies `class="dark"` for default dark mode |
| `.gitignore` | Excludes `dist/`, `dist-electron/`, `*.sqlite`, `out/` |
| `python/transcriber.py` | faster-whisper entrypoint; emits `PROGRESS: XX` to stderr |
| `python/utils/audio_extractor.py` | FFmpeg-based WAV extraction for transcription |
| `python/build.py` | PyInstaller builder for standalone executables |
| `python/download_models.py` | Downloads whisper-base to assets/models/ |
| `vitest.config.ts` | Vitest test config extending Vite |
| `tests/unit/main-utils.test.ts` | Unit tests for main-process utilities |
| `scripts/test-transcriber.js` | E2E smoke test for transcriber binary |

## Constraints
- Python backend is **partially implemented** — transcriber and audio extractor are done; chunker, analyzer, and editor are Phase 3+.
- `assets/ffmpeg/` holds platform FFmpeg binaries (downloaded via `npm run download:ffmpeg` before release builds). Dev mode still falls back to system `PATH` when bundled binaries are absent.
- `assets/models/` exists after running `npm run download:models`.
- Test frameworks are configured (Vitest for TypeScript, pytest for Python, E2E smoke test).
- macOS packaging works (`.dmg`). Windows (`nsis`) configured but not tested.
