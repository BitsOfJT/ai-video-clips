# Phase 1 Implementation Plan — Project Scaffold

## Goal
Set up the Electron + Vite + React + TypeScript foundation with Tailwind CSS, shadcn/ui, Zustand, SQLite, and a basic layout for the AI Video Clipper app.

## Context
This is a **pre-scaffold** repository. No source code, build configs, or tooling exists. The canonical spec lives in `plan.md`. This scaffold must respect the directory boundaries defined there.

---

## Directory Layout

```
ai-video-clips/
├── .opencode/
│   └── .gitignore
├── AGENTS.md                           ← Updated after scaffold
├── plan.md                              ← Canonical spec (READ THIS FIRST)
├── package.json
├── tsconfig.json                        ← Base TS config
├── tsconfig.node.json                  ← Node-side config (Vite, Electron main)
├── vite.config.ts                       ← Vite + Electron plugin config
├── tailwind.config.js                  ← Tailwind + shadcn theme colors
├── postcss.config.js                   ← PostCSS for Tailwind
├── electron/
│   ├── main.ts                          ← Entry: window mgmt, DB, process spawning
│   └── preload.ts                      ← Secure IPC bridge
├── index.html                           ← Renderer entry HTML
├── src/
│   ├── renderer/                        ← React frontend
│   │   ├── App.tsx                      ← Root component
│   │   ├── main.tsx                     ← React DOM mount
│   │   ├── index.css                    ← Tailwind directives + CSS vars
│   │   ├── lib/
│   │   │   └── utils.ts                 ← cn() helper for shadcn
│   │   ├── components/
│   │   │   ├── ui/                      ← shadcn/ui components (installed via CLI)
│   │   │   ├── ImportZone.tsx          ← Drag-and-drop video import
│   │   │   ├── Sidebar.tsx             ← Navigation sidebar
│   │   │   ├── Layout.tsx              ← Main layout (sidebar + content area)
│   │   │   └── TranscriptViewer.tsx    ← Placeholder for Phase 2
│   │   ├── store/
│   │   │   └── useAppStore.ts          ← Zustand global state (minimal)
│   │   ├── hooks/
│   │   │   └── useIPC.ts               ← Helper to invoke IPC channels
│   │   └── pages/
│   │       └── HomePage.tsx            ← Main page: Import + grid placeholder
│   ├── types/
│   │   └── electron.d.ts               ← Shared IPC types (preloads)
│   └── constants.ts                     ← Key values (versions, paths)
├── public/                              ← Static assets served by Vite
├── components.json                      ← shadcn/ui config (auto-gen)
└── .gitignore                           ← Node modules, dist, .opencode/gitignore
```

---

## Technical Decisions

### 1. Build Tooling
- **Vite** for both renderer and Electron main build via `vite-plugin-electron`.
- Two build targets: `src/renderer` → browser bundle, `electron/main.ts` → Node bundle.
- Hot Module Replacement (HMR) enabled for renderer during dev.

### 2. TypeScript
- Strict mode enabled. `noUncheckedIndexedAccess: false` (keeps it pragmatic).
- Use `type` imports where possible for tree-shaking.
- Renderer types live in `src/types/electron.d.ts`.
- Preload script is bundled separately from main.

### 3. Electron Architecture
- **Main Process (`electron/main.ts`)**:
  - Spawns BrowserWindow.
  - Registers IPC handlers (wrappers around Node APIs).
  - Initializes SQLite DB (`database.sqlite` in userData).
  - Spawns Python subprocesses (Phase 2+).
- **Preload Script (`electron/preload.ts`)**:
  - Exposes only whitelisted channels via `contextBridge.exposeInMainWorld`.
  - No direct Node API exposure to renderer.
- **Renderer**:
  - Communicates via `window.electronAPI` exposed by preload.

### 4. IPC Channels (initial)
```typescript
// Request/Response (invoke)
"db:getProjects": () => Project[]
"db:createProject": (videoPath: string, metadata: VideoMeta) => Project
"video:probeMetadata": (videoPath: string) => VideoMeta

// One-way (send)
"video:importDropped": (filePaths: string[]) => void  // Sent from main on drop
```

### 5. Database Schema (SQLite via `better-sqlite3`)
Tables to create in main process:
- `projects`: id, video_path, duration_sec, width, height, fps, created_at, status
- `clips`: id, project_id, start_ms, end_ms, ai_score, status, created_at
- `settings`: key, value

### 6. UI Framework
- **Tailwind CSS** with `@tailwindcss/vite` plugin.
- **shadcn/ui** CLI-initiated with `neutral` base color, `slate` accent, `radius: 0.5rem`.
- Components installed: `button`, `card`, `dialog`, `input`, `textarea`, `label`, `separator`, `tooltip`.
- Theme CSS variables in `index.css`.

### 7. FFmpeg Probing
- On import, call `ffprobe` via `child_process.execFile` with JSON output (`-print_format json`).
- Parse `format.duration`, `streams[0].width/height`, `streams[0].r_frame_rate`.
- Store metadata in DB and send to renderer via IPC.

### 8. Drag & Drop
- Handle `dragover` and `drop` on a designated zone in renderer.
- Send file paths to main via IPC.
- Main validates extension (`.mp4`, `.mov`, `.mkv`, `.avi`, `.webm`) then probes + inserts DB.

### 9. Zustand Store
Minimal initial state:
```typescript
interface AppState {
  projects: Project[];
  currentProjectId: string | null;
  isProbing: boolean;
  probeError: string | null;
  // Actions (setters)
}
```

---

## Setup Steps

### Step 1 — Init core packages
- Install: `electron`, `vite`, `@vitejs/plugin-react`, `vite-plugin-electron`, `react`, `react-dom`, `typescript`, `@types/react`, `@types/react-dom`, `@types/node`, `tailwindcss`, `@tailwindcss/vite` (or `autoprefixer` + `postcss`), `clsx`, `tailwind-merge`, `zustand`, `better-sqlite3`, `@types/better-sqlite3`.
- Configure `package.json` with `scripts: dev`, `build`, `preview`, `lint`, `typecheck`, `db:migrate`.

### Step 2 — Configure tooling
- `vite.config.ts` with `vite-plugin-electron`, dual entry points, alias `@/` to `src/`.
- `tsconfig.json` strict + moduleResolution bundler, paths alias.
- `tailwind.config.js` extend theme with CSS vars for shadcn.
- `components.json` with baseColor neutral, neutral style, aliases pointing to `src/renderer/components/ui`, lib `src/renderer/lib`.

### Step 3 — Scaffold entry files
- `index.html` points to `src/renderer/main.tsx`.
- `src/renderer/main.tsx` mounts `<App />` inside root div.
- `src/renderer/App.tsx` sets up `<Layout />` with `<Sidebar />` and `<HomePage />`.

### Step 4 — Implement IPC Bridge
- Define shared IPC types in `src/types/electron.d.ts`.
- Write `electron/preload.ts` exposing typed API object.
- Write `electron/main.ts` registering IPC handlers and window setup.

### Step 5 — Implement DB initialization
- In `electron/main.ts`, ensure `app.whenReady()` initializes SQLite tables if absent.
- Use `app.getPath('userData')` as DB directory.
- Wrap raw SQL in helper module.

### Step 6 — Implement video import
- `ImportZone` component: styled drop zone with SVG icon.
- IPC channel: `video:import` sends array of file paths.
- Main handler: validate extensions → ffprobe → insert project → respond.
- `Sidebar` shows project list fetched via `db:getProjects`.
- `HomePage` displays import status and current project placeholder.

### Step 7 — Verify
- `npm run dev` launches Electron window.
- HMR works on renderer code changes.
- Dropping a video triggers probe + DB insert.
- App renders sidebar + main area without runtime errors.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `vite-plugin-electron` version churn causing API drift | Pin to latest stable, follow official quickstart example. |
| Native module (`better-sqlite3`) compile failure in Electron | Ensure rebuild after install; use `electron-rebuild` if needed. |
| Tailwind v4 config format vs v3 | If `create-tailwind` defaults to v4, adapt import syntax accordingly. |
| shadcn CLI + Vite HMR conflicts | Use manual component copy if CLI fails; source from shadcn registry. |

---

## Success Criteria
- [ ] `npm run dev` opens Electron window with Tailwind styles.
- [ ] Sidebar and main content layout renders.
- [ ] Dropping a video file populates DB and shows metadata.
- [ ] No TypeScript compilation errors.
- [ ] `npm run build` produces distributable Electron app.
