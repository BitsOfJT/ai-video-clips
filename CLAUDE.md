# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The canonical agent guidance for this repo lives in **[AGENTS.md](./AGENTS.md)** — commands, architecture, IPC channels, and the full list of gotchas (ESM-only main process, Tailwind v4, IPC type safety, dev/prod path resolution, etc.). Read it first.

@AGENTS.md

The product spec / phase roadmap is in **[plan.md](./plan.md)** — read it before making architectural decisions.

## Orientation (the parts that span multiple files)

This is a **local-first Electron desktop app**: all video processing (transcription, audio extraction) runs on-device via a bundled Python/faster-whisper binary — there is no backend server.

The three processes communicate only through a typed, whitelisted IPC layer whose **single source of truth is `src/constants.ts`** (`IPC_CHANNELS` / `VALID_IPC_CHANNELS` / `ONE_WAY_IPC_CHANNELS`). Adding a feature that crosses the process boundary touches four files in lockstep:

1. `src/constants.ts` — declare the channel
2. `electron/main.ts` — register the handler (request/response) or emitter (one-way push)
3. `electron/preload.ts` — expose it through `contextBridge` (request channels are whitelist-checked; the `transcription:*` and `analysis:*` push channels get dedicated `on*` listeners)
4. `src/types/electron.d.ts` — extend the `ElectronChannel` union and `Window.electronAPI` types

There are two long-running, streaming flows, both pushing `:progress` / `:complete` / `:error` one-way to the renderer where the Zustand store (`src/renderer/store/useAppStore.ts`) holds state. Listeners are registered once behind a module-level flag to survive Vite HMR.

1. **Transcription** (Phase 2): `transcription:start` spawns the Python child process; the main process parses `PROGRESS: XX` from its stderr.
2. **AI analysis** (Phase 3): `analysis:start` runs entirely in the main process (TypeScript, no child process) — see `electron/analysis/`. It chunks the transcript on sentence/pause boundaries (`chunker.ts`), then does a two-pass scoring (batched text → keyframe vision refinement) via a pluggable `AnalysisProvider` (`providers/`). **Ollama is the default provider** (local/offline, no key); **Gemini** is optional opt-in. All AI network calls live in the main process because the renderer CSP is `connect-src 'self'`. The Gemini API key is encrypted at rest via `safeStorage` in `electron/settings.ts` and never returned to the renderer.

## Commands

```bash
npm run dev          # Electron + Vite HMR (main process compiled on the fly)
npm run build        # tsc + vite build + electron-builder (.dmg / .exe)
npm run typecheck    # tsc --noEmit (strict)
npm run lint         # ESLint flat config; --max-warnings 0
npm run test         # Vitest (TS main-process utils, tests/unit/)
npm run test:watch   # Vitest watch mode
npm run test:e2e     # Smoke test: generate a video + run the transcriber binary end-to-end
npm run test:python  # pytest (python/tests/)
npm run download:models  # Fetch faster-whisper base model into assets/models/
npm run build:python     # PyInstaller -> assets/bin/transcriber

# Run a single test
npx vitest run tests/unit/main-utils.test.ts          # one Vitest file
python3 -m pytest python/tests/test_transcriber.py -v # one pytest file
python3 -m pytest python/tests/test_transcriber.py::test_name -v  # one test
```

## First-run setup

The transcriber binary and model are **not in the repo** — after `npm install`, run `npm run download:models` and `npm run build:python` (requires Python 3.10+, PyInstaller, and FFmpeg on `PATH`) or transcription will fail.
