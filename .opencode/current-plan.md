# Phase 2 Implementation Plan — Transcription Pipeline

## Goal
Enable the app to transcribe imported videos using a local `faster-whisper` model, store word-level timestamps in SQLite, and display them in a `TranscriptViewer` component.

## Context
Phase 1 scaffold is live. We have Electron + Vite + React + TS + Tailwind v4 + shadcn/ui + Zustand + better-sqlite3.
- `electron/main.ts` handles IPC, DB, and window management.
- `src/renderer/store/useAppStore.ts` manages global state.
- `src/constants.ts` and `src/types/electron.d.ts` define IPC contracts.
- No Python backend exists yet.

## Requirements
1. **Manual trigger**: "Start Transcription" button per project.
2. **Model**: `faster-whisper` `base` bundled under `assets/models/whisper-base/`.
3. **Progress**: Streamed to UI via one-way IPC (`main → renderer`).
4. **Audio extraction option**: UI toggle between:
   - *"Transcribe video directly (fastest)"*
   - *"Extract audio first with FFmpeg (most reliable)"*
5. **Reusable packaging**: Unified `python/build.py` for all PyInstaller builds.

---

## Architecture Changes

### 1. Python Backend (`python/`)
```
python/
├── requirements.txt          # faster-whisper, etc.
├── build.py                  # Unified PyInstaller builder
├── download_models.py        # Downloads whisper-base weights to assets/
├── transcriber.py            # Entrypoint: args → NDJSON progress → final JSON
└── utils/
    └── audio_extractor.py    # Optional FFmpeg wrapper for audio extraction
```

**`transcriber.py`** CLI contract:
- `--video-path` (required)
- `--model-dir` (required, points to `assets/models/whisper-base/`)
- `--output-json` (required, path to write final transcript)
- `--extract-audio` (optional flag)
- Emits progress to stderr in a parseable format: `PROGRESS: 45`
- Writes final transcript JSON with word-level timestamps:
  ```json
  {
    "segments": [
      { "start": 0.0, "end": 5.4, "text": "Hello world", "words": [...] }
    ]
  }
  ```

**`build.py`**:
- Scans a manifest of entrypoints (starting with `transcriber.py`).
- Generates PyInstaller specs with shared options.
- Outputs platform-specific binaries to `assets/bin/`.
- Run via `npm run build:python`.

---

### 2. DB Schema Additions
Add to `projects` table:
- `transcript_status`: `'idle' | 'extracting_audio' | 'transcribing' | 'completed' | 'failed'`
- `transcript_json`: `TEXT` (nullable, stores the full transcript blob)

No separate table needed yet; parsing the JSON blob in the renderer is fine for Phase 2.

---

### 3. IPC Contract Expansion
New channels in `src/constants.ts`:
```typescript
TRANSCRIPTION_START: "transcription:start"
TRANSCRIPTION_PROGRESS: "transcription:progress"
TRANSCRIPTION_COMPLETE: "transcription:complete"
TRANSCRIPTION_ERROR: "transcription:error"
```

**Critical**: `electron/preload.ts` currently only exposes `invoke()`. One-way push requires adding listener wrappers:
```typescript
onTranscriptionProgress: (callback) => {
  ipcRenderer.on(IPC_CHANNELS.TRANSCRIPTION_PROGRESS, (_, progress) => callback(progress));
},
// ... plus onComplete, onError
```

Update `src/types/electron.d.ts` to include these signatures in the global `Window.electronAPI` interface.

---

### 4. Main Process Logic (`electron/main.ts`)
New handler: `transcription:start`
1. Look up project in DB → get `video_path`.
2. Determine working audio path (original video, or temp WAV if `--extract-audio`).
3. Spawn `assets/bin/transcriber` with args.
4. Parse stderr for `PROGRESS: XX` → `mainWindow.webContents.send('transcription:progress', { projectId, percent })`.
5. On exit 0: read output JSON, update DB (`transcript_json`, `transcript_status='completed'`), emit `transcription:complete`.
6. On error: emit `transcription:error`, update DB `transcript_status='failed'`.

Process lifecycle: track active child processes; kill them on `window-all-closed` if needed.

---

### 5. Renderer UI Components

**`TranscriptionControls.tsx`** (placed on `HomePage` or future `ProjectPage`):
- "Start Transcription" button (disabled if `transcript_status` is active).
- Select dropdown:
  - *"Transcribe video directly (fastest)"*
  - *"Extract audio first with FFmpeg (most reliable)"*
- Status text + progress bar when running.

**`TranscriptViewer.tsx`**:
- Reads `transcript_json` from the selected project.
- Renders segments/words in a scrollable list (shadcn `ScrollArea`).
- Clicking a word logs the timestamp (placeholder for future video seeking).

**Zustand store updates (`useAppStore.ts`)**:
- `transcriptionProgress: Record<string, number>` (per-project percent).
- `startTranscription(projectId, extractAudio)`.
- `setTranscriptionProgress(projectId, percent)`.
- Subscribe to preload listeners on store init.

---

### 6. Asset & Build Configuration
- **Model download**: `npm run download:models` fetches `Systran/faster-whisper-base` into `assets/models/whisper-base/`. (Not checked into git.)
- **Python build**: `npm run build:python` compiles `transcriber.py` → `assets/bin/transcriber`.
- **electron-builder.yml**: Add `assets/models/` and `assets/bin/` to `extraResources`.
- **`.gitignore`**: Ignore `assets/models/*`, `assets/bin/*`, but keep `.gitkeep` in both dirs.

---

## Task Breakdown

1. **Python scaffold**: `python/requirements.txt`, `transcriber.py` prototype, `download_models.py`.
2. **Model download**: Run script, verify `assets/models/whisper-base/` exists.
3. **Audio extractor util**: Small FFmpeg wrapper in `python/utils/audio_extractor.py`.
4. **PyInstaller builder**: `python/build.py` producing `assets/bin/transcriber`.
5. **IPC expansion**: Constants, types, preload listeners.
6. **DB migration**: `ALTER TABLE` additions in `initDatabase()`.
7. **Main transcription handler**: Spawn, parse, progress push, DB update.
8. **Renderer components**: `TranscriptionControls`, `TranscriptViewer`.
9. **Zustand wiring**: Per-project transcription state + listener setup.
10. **Builder config**: Update `electron-builder.yml`, add npm scripts.
11. **Verification**: End-to-end test with a sample video.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| PyInstaller output is huge | Bundle only `base` model; compress with UPX if needed. |
| CPU transcription is slow | Show honest progress; allow future GPU settings. |
| FFmpeg audio extraction adds overhead | Make it optional; user chooses. |
| Preload security expansion | Only whitelist the 3 new channels; keep `contextIsolation=true`. |

---

## Success Criteria
- [ ] `npm run build:python` produces a working `transcriber` executable.
- [ ] Clicking "Start Transcription" on a project triggers the pipeline.
- [ ] Progress percentage updates the UI in real time.
- [ ] Final transcript JSON is saved to SQLite.
- [ ] `TranscriptViewer` renders word-level timestamps.
- [ ] Both "direct" and "extract audio" modes work correctly.
