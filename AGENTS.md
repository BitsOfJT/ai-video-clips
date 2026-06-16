# AGENTS.md — ai-video-clips

## Project State
- **Phase 1 scaffold is LIVE.** Electron + Vite + React + TypeScript + Tailwind v4 + shadcn/ui + Zustand + better-sqlite3.
- The canonical spec is [`plan.md`](./plan.md). Read it before making architectural decisions.

## Quick Commands
```bash
npm run dev        # Start Electron in dev mode (Vite HMR + plugin-electron)
npm run build      # Full pipeline: tsc + vite build + electron-builder
tsc --noEmit       # Type check only (strict mode, ES2022, bundler resolution)
npm run lint       # ESLint via flat config (typescript-eslint + react-hooks + react-refresh)
```

## Architecture
- **Electron Main** (`electron/main.ts`): Window mgmt, DB init (`better-sqlite3`), IPC handlers, FFmpeg `ffprobe` spawning.
- **Preload** (`electron/preload.ts`): Secure `contextBridge` exposing only whitelisted IPC channels via `window.electronAPI`.
- **Renderer** (`src/renderer/`): React frontend. Tailwind v4 + shadcn/ui. Dark theme default (`class="dark"` on `<html>`).
- **IPC Channels** (single source of truth in `src/constants.ts`):
  - `video:probeMetadata` — runs `ffprobe`, returns `{ durationSec, width, height, fps }`
  - `db:getProjects` / `db:createProject` — SQLite via `better-sqlite3`
- **DB Location**: `app.getPath('userData')` + `database.sqlite`. Auto-created on first launch.

## Key Gotchas

### ESM Only — No `__dirname` / `__filename`
- `package.json` has `"type": "module"`. Both Electron and Vite are ESM.
- In `electron/main.ts`, reconstruct `__dirname` manually:
  ```typescript
  import { fileURLToPath } from "node:url";
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  ```
- **Do NOT** use `__dirname` in `vite.config.ts` — Vite handles it internally.

### Tailwind v4 (Not v3)
- Uses `@import "tailwindcss"` + `@theme { --color-background: hsl(var(--background)); ... }` in `src/renderer/index.css`.
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

### shadcn/ui Quirk
- `src/renderer/components/ui/button.tsx` exports `buttonVariants` alongside the component.
- ESLint config allows this via `allowExportNames: ['buttonVariants']` to prevent `react-refresh/only-export-components` warnings.

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
| `.gitignore` | Excludes `dist/`, `dist-electron/`, `*.sqlite`, `out/` |

## Constraints
- Python backend is **not yet implemented** — Phase 2+.
- `assets/ffmpeg/` and `assets/models/` do not exist yet.
- No test framework configured yet.
- macOS packaging works (`.dmg`). Windows (`nsis`) configured but not tested.
