# AI Video Clipper — Project Plan

## Overview

A cross-platform desktop application with **two complementary workflows** on the same imported video and local transcript:

1. **Shorts Clipper** — AI finds, ranks, and exports vertical clips for YouTube Shorts and TikTok (Phases 1–5 ✅).
2. **Long-Form Editor** — a dedicated tab for assembling and polishing full-length YouTube videos (10–60+ min, 16:9) with transcript-native editing (Phases 7–9, planned).

The Shorts path uses a **Creative Brief** so users describe what they're looking for (funny clips, action moments, emotional peaks, etc.). The Long-Form path treats the transcript as the primary editing surface (Descript-style), then exports one master 16:9 file with chapters, SRT captions, and YouTube metadata.

These modes stay **strictly separated** in UI and export pipelines: Shorts = many 9:16 moments; Long-Form = one narrative 16:9 master. A bridge lets users send a finished long-form edit into the Shorts Clipper for AI moment extraction.

---

## Core Concept

### Shorts Clipper (shipped)

1. **Import**: User drags and drops a local video file into the app.
2. **Creative Brief**: User describes what kind of clips they want (action, funny, emotional, tutorial, etc.).
3. **Video Type Selection**: User picks the content type (Podcast/Livestream vs. Vlog/Short-form vs. Gaming etc.) to optimize chunking strategy.
4. **Transcription**: Local AI transcribes the entire video with millisecond-level word timestamps.
5. **AI Analysis**: The video is chunked into candidate segments. An AI model (Gemini or local Ollama) rates each segment based on the user's creative brief.
6. **Ranking**: Segments are scored by a composite algorithm (AI relevance + audio energy + visual dynamism + speech density).
7. **Preview**: User browses top-ranked clips in a grid with thumbnails, AI descriptions, and virality scores.
8. **Auto-Edit**: Selected clips are automatically:
   - Trimmed to optimal length (15–60 seconds)
   - Cropped to 9:16 vertical (center-crop for v1)
   - Captioned with animated, word-by-word karaoke-style subtitles
9. **Export**: Clips are rendered locally via FFmpeg into ready-to-upload MP4s.

### Long-Form Editor (planned)

1. **Open Long-Form tab** on the same project (shared import + transcript).
2. **Content preset** (Talking Head first; Podcast / Tutorial / Vlog later) configures default layout and tools.
3. **Transcript-native rough cut**: delete text → ripple-cut video; remove fillers and long silences.
4. **Timeline polish**: multi-track A-roll / B-roll / music, basic color, lower thirds, chapter markers.
5. **YouTube package**: 16:9 H.264 export + SRT/VTT + chapter list + thumbnail frame + metadata panel.
6. **Optional bridge**: "Find Shorts" sends the master (or source + EDL) into the Shorts Clipper.

---

## Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Desktop Framework** | Electron + Vite + React + TypeScript | Robust video UI, easy native file handling, mature cross-platform packaging (`.dmg` for Mac, `.exe` for Windows). |
| **Styling** | Tailwind CSS + shadcn/ui | Fast, modern dashboard layouts and components. |
| **State Management** | Zustand | Lightweight, scalable state for video projects and clips. |
| **Database** | SQLite (embedded) | Zero-config local storage for videos, transcripts, clip metadata, and user settings. |
| **AI/ML Backend** | Python scripts packaged with PyInstaller | Bundled into standalone executables so users don't need Python installed. |
| **Transcription** | faster-whisper (local) | Free, offline, accurate word-level timestamps for captions. |
| **Video Processing** | FFmpeg (bundled for macOS & Windows) | Industry standard for trimming, cropping, and rendering. |
| **AI Analysis** | Google Gemini API (free tier) + Ollama (offline fallback) | Gemini understands video natively with 1,500 requests/day free. Ollama provides unlimited local processing with vision-capable models. |
| **Smart Crop v1** | Center-crop to 9:16 | Fast and reliable. See **Future Feature Drops** for face-tracking. |

---

## Architecture

```
📁 ai-video-clips/
│
├── 📁 electron/                    # Main process & preload (Node/TS)
│   ├── main.ts                     # Window management, DB, Python/FFmpeg process spawning
│   └── preload.ts                  # Secure IPC bridge between main and renderer
│
├── 📁 src/renderer/                  # React frontend (Chromium/Electron UI)
│   ├── components/
│   │   ├── ImportZone.tsx            # Drag-and-drop video import
│   │   ├── CreativeBriefInput.tsx   # Text area for user to describe desired clips
│   │   ├── VideoTypeSelector.tsx    # Podcast vs. Vlog chunking strategy selector
│   │   ├── TranscriptViewer.tsx     # Clickable word-level transcript
│   │   ├── ClipGrid.tsx              # Grid of AI-suggested clips with scores
│   │   ├── ClipCard.tsx              # Individual clip thumbnail + metadata
│   │   ├── PreviewPlayer.tsx         # In-app clip preview with captions
│   │   ├── EditorPanel.tsx           # Shorts: manual trim/crop adjustments
│   │   ├── ExportQueue.tsx           # Batch export status and progress
│   │   └── editor/                   # Long-Form Editor (Phase 7+) — planned
│   │       ├── TimelineEditor.tsx
│   │       ├── TranscriptEditPanel.tsx
│   │       ├── WaveformLane.tsx
│   │       └── LongFormExportPanel.tsx
│   ├── pages/
│   │   ├── HomePage.tsx              # Shorts Clipper workflow
│   │   └── LongFormEditorPage.tsx    # Long-Form YouTube tab (planned)
│   ├── hooks/
│   │   ├── useVideoAnalysis.ts       # Orchestrates transcribe → analyze → rank flow
│   │   └── useExportQueue.ts         # Manages FFmpeg render jobs
│   ├── store/
│   │   ├── useAppStore.ts            # Zustand: projects, Shorts clips, loading
│   │   └── useLongFormStore.ts       # Zustand: timeline EDL, playhead, undo (planned)
│   └── App.tsx
│
├── 📁 src/python/                    # Packaged into standalone executables
│   ├── transcriber.py                # faster-whisper → JSON transcript with timestamps
│   ├── chunker.py                    # Segments video based on type (podcast vs. vlog)
│   ├── analyzer.py                   # Builds AI prompts with creative brief, calls Gemini/Ollama
│   ├── ranker.py                     # Composite scoring algorithm
│   ├── editor.py                     # Builds FFmpeg pipeline (trim, crop, subtitle burn)
│   └── smartcrop.py                  # Placeholder for future face-tracking crop logic
│
├── 📁 assets/
│   ├── ffmpeg/
│   │   ├── macos/ffmpeg              # macOS FFmpeg binary
│   │   └── windows/ffmpeg.exe          # Windows FFmpeg binary
│   └── models/
│       └── whisper-base/             # faster-whisper model weights
│
├── database.sqlite                   # Auto-created on first launch
├── package.json
├── vite.config.ts
├── tsconfig.json
└── electron-builder.yml              # Config for .dmg and .exe packaging
```

---

## Key Features

### 1. Creative Brief Input
- **Text Area**: Freeform input where the user describes what they're looking for.
  - *Examples*: "Funny reaction moments," "High-intensity gameplay kills," "Emotional story beats," "Tutorial tips and tricks."
- **Preset Buttons**: Quick-select tags for common genres (Gaming, Podcast, Comedy, Education, Vlog).
- **Prompt Injection**: The creative brief is injected into the Gemini/Ollama system prompt so the AI scores clips based on the user's intent, not generic "virality."

### 2. Video Type Selection
- **Podcast / Livestream Mode**: Optimized for talking-head content. Chunks are longer, prioritizing coherent dialogue arcs.
- **Vlog / Short-form Mode**: Optimized for fast-paced content. Chunks are shorter, prioritizing visual dynamism and quick cuts.
- This setting adjusts the chunking parameters (duration, overlap, scene-change detection sensitivity).

### 3. Local Transcription
- Uses **faster-whisper** (base or small model, bundled) to transcribe the entire video offline.
- Outputs word-level timestamps with high precision.
- Transcript is stored in SQLite and displayed in a clickable timeline viewer.

### 4. AI-Powered Clip Analysis
- **Chunking Strategy**:
  - For podcasts: 30–90 second chunks with 10-second overlap.
  - For vlogs: 15–45 second chunks with 5-second overlap.
- **AI Evaluation (Gemini)**:
  - Each chunk is evaluated on:
    - **Hook Strength** (does it grab attention in the first 3 seconds?)
    - **Relevance to Brief** (how well does it match the user's creative brief?)
    - **Self-Containment** (does it make sense without prior context?)
    - **Emotional Arc** (surprise, humor, tension, excitement)
    - **Platform Fit** (Shorts vs. TikTok pacing)
- **Local Fallback (Ollama)**:
  - If the user prefers privacy or hits Gemini rate limits, they can switch to a local vision model via Ollama.
  - Recommended models: `moondream2`, `llava`, or `llama3.2-vision`.

### 5. Composite Ranking Algorithm
Each clip receives a final score combining:
| Factor | Weight | Source |
|--------|--------|--------|
| AI Relevance Score | 40% | Gemini / Ollama output |
| Audio Energy (RMS/volume spikes) | 20% | Python audio analysis |
| Visual Dynamism (scene changes, motion) | 20% | OpenCV frame differencing |
| Speech Density (words per second) | 10% | Transcript analysis |
| First-3-Second Hook Score | 10% | Gemini / Ollama sub-evaluation |

Clips are sorted by final score and presented in a "Top Picks" grid.

> **v1 status (Phase 4):** Audio energy, visual dynamism, and speech density require Python/OpenCV analysis that isn't built yet. The shipped v1 ranker (`src/renderer/lib/scoring.ts`) redistributes their combined 50% across the AI-derived signals — **40% `ai_score` · 30% `brief_relevance` · 10% `hook_strength` · 10% `emotional_arc` · 10% `platform_fit`** — computed at display time from DB signals. The table above remains the target once those signals are available.

### 6. Clip Preview & Selection
- **Grid View**: Thumbnails + AI-generated title/description + virality score badge.
- **Preview Player**: Click to play the full segment with simulated 9:16 crop overlay.
- **Selection**: User selects which clips to auto-edit and export.

### 7. Auto-Edit Engine
- **Trimming**: Adjusts start/end to the nearest word boundary for clean cuts.
- **9:16 Vertical Crop**: Center-crop applied automatically. User can manually adjust pan position.
- **Animated Captions**:
  - Karaoke-style: Each word highlights as it's spoken.
  - Font: Bold sans-serif, stroke/shadow for readability.
  - Position: Lower-third, safe for mobile screens.
  - Generated as ASS (Advanced SubStation Alpha) and burned in with FFmpeg.

### 8. Export Queue
- **Batch Rendering**: Queue multiple clips for sequential rendering.
- **Progress Tracking**: Real-time FFmpeg progress shown in UI.
- **Output**: 1080x1920 MP4, H.264, AAC audio — ready for direct upload to YouTube Shorts / TikTok.

### 9. Long-Form YouTube Editor Tab (planned — Phases 7–9)
A dedicated Sidebar tab for assembling **one 16:9 YouTube master**, separate from the Shorts Clipper.

- **Transcript-native editing**: click-to-seek, select text → ripple-delete video (Descript-class workflow on local word timestamps).
- **Cleanup tools**: Remove Filler Words + Remove Long Silences with preview/confirm.
- **Timeline**: multi-track (A-roll / B-roll / music), waveforms, ripple trim, snap-to-word, undo/redo.
- **YouTube packaging**: chapter markers (export description timestamps), clean CC + SRT/VTT sidecar, -14 LUFS normalize, 1080p preset, thumbnail frame grab, metadata panel.
- **Content presets** (Phase 8): Talking Head → Podcast/Interview (multicam) → Tutorial (zoom-n-pan/callouts) → Vlog (B-roll + ducking).
- **Bridge**: "Send to Shorts Clipper" after long-form export for AI moment extraction.
- **Explicitly not in this tab**: virality scores, 9:16 reframe, karaoke captions, beat-sync cuts, CapCut-style effect libraries.

---

## Development Phases

### Phase 1: Project Scaffold ✅ COMPLETE
- [x] Initialize Electron + Vite + React + TypeScript project.
- [x] Configure Tailwind CSS and shadcn/ui.
- [x] Set up Zustand store and SQLite schema (projects, videos, clips).
- [x] Implement drag-and-drop video import.
- [x] Probe video metadata (duration, resolution, FPS) using bundled FFmpeg.
- [x] Basic layout: sidebar navigation + main content area.

### Phase 2: Transcription Pipeline ✅ COMPLETE
- [x] Package `transcriber.py` (faster-whisper) as a standalone executable.
- [x] Spawn transcriber from Electron main process on video import.
- [x] Stream progress back to renderer via IPC.
- [x] Store transcript in SQLite with word-level timestamps.
- [x] Build `TranscriptViewer` component (clickable words seek video).

### Phase 3: Creative Brief & Analysis ✅ COMPLETE
- [x] Build `CreativeBriefInput` component (text area + preset buttons).
- [x] Build `VideoTypeSelector` component (Podcast vs. Vlog).
- [x] Implement chunker + analyzer in the **Electron main process (TypeScript)**, not as Python executables (they are just transcript-slicing + HTTP/JSON; keeps the API key in one place and satisfies the renderer CSP).
- [x] Implement chunking logic based on video type (sentence/pause-boundary aware so clips never cut mid-sentence).
- [x] Build AI prompt template incorporating creative brief (shared across providers, enforced structured JSON output).
- [x] Implement Gemini API client (free tier, rate-limit aware, structured output).
- [x] Implement Ollama local client — now the **default provider** (fully local/offline, no API key), so users never depend on a Gemini free tier.
- [x] Two-pass analysis: batched text scoring → shortlist → keyframe vision refinement (full vision support in v1).
- [x] Display AI-generated clip suggestions in `ClipGrid`.
- [x] Minimal Settings panel (provider + encrypted API key) pulled forward from Phase 6.

### Phase 4: Ranking & Preview ✅ COMPLETE
- [x] Composite scoring — implemented as a **renderer utility** (`src/renderer/lib/scoring.ts`), not `ranker.py`. Computed at display time from signals already in the DB, so no new column goes stale when weights change. v1 weights: 40% `ai_score` · 30% `brief_relevance` · 10% `hook_strength` · 10% `emotional_arc` · 10% `platform_fit`.
- [ ] Calculate audio energy and visual dynamism for each chunk. *(Deferred — requires Python/OpenCV audio + frame-differencing analysis. Their planned share is redistributed across the AI/brief signals in v1; revisit in a later phase.)*
- [x] Sort clips by composite score and render in grid (`sortByComposite` in `ClipGrid`).
- [x] Generate clip thumbnails via FFmpeg frame extraction — `clip:getThumbnail` IPC handler reuses `extractKeyframes` from `electron/analysis/keyframes.ts`, writes JPEG bytes to `userData/thumbnails/<clipId>.jpg`, returns base64. Hardened with video-path re-validation and UUID-based filenames.
- [x] Build `ClipCard` with AI title, description, score badge (per-criterion breakdown), thumbnail, and selection ring.
- [x] Build `PreviewPlayer` with 9:16 crop simulation overlay, loop-within-clip playback, Escape-to-close, and score + reasoning display. Backed by a hardened `app-video://` custom protocol (CSP `media-src app-video:`).
- [x] Clip selection state in the Zustand store (`selectedClipId`); `AnalysisControls` mounts `PreviewPlayer` when a clip is selected.

### Phase 5: Auto-Edit & Export ✅ COMPLETE
> *All Phase 5 items were implemented as part of the Phase 4 PR (`feature/phase-4-editor-export`).*
- [x] Package `editor.py` as executable — PyInstaller-built `assets/bin/editor`.
- [x] Implement ASS subtitle generation from transcript (karaoke highlighting) — `generate_ass_subtitles()` in `python/editor.py`.
- [x] Build FFmpeg pipeline: trim → crop → subtitle burn-in → encode — full pipeline in `python/editor.py`.
- [x] Build `EditorPanel` for manual crop/trim adjustments — `src/renderer/components/EditorPanel.tsx`.
- [x] Build `ExportQueue` with batch rendering and progress bars — `src/renderer/components/ExportQueue.tsx`.
- [x] Save exported clips to user-selected output folder — native save dialog in `export:start` IPC handler.

### Phase 6: Polish & Cross-Platform Packaging
- [ ] Settings panel: API keys, Ollama toggle, FFmpeg path override. *(Provider selector + encrypted Gemini key + Ollama URL/models shipped in Phase 3; FFmpeg path override still pending.)*
- [x] Error handling and logging for all Python subprocesses (Security validated & hardened).
- [ ] macOS `.dmg` packaging.
- [ ] Windows `.exe` packaging (Inno Setup or NSIS installer).
- [ ] Test on both platforms with sample videos.

### Phase 7: Long-Form Editor Tab — Transcript-Native MVP
> *New top-level workflow. Positioning: **Descript-meets-iMovie, local-first** — not a Premiere clone. Shorts Clipper and Long-Form Editor stay separate tabs with separate export pipelines (9:16 karaoke clips vs 16:9 master + SRT).*

**Product framing (research-backed)**
- Researched feature sets from Premiere Pro, DaVinci Resolve, Final Cut Pro, Descript, CapCut Desktop, Filmora, Camtasia, ScreenFlow, and iMovie, then curated for **YouTube long-form** (talking head, podcast, tutorial, vlog) — not Shorts/TikTok.
- Long-form success metrics: average view duration, chapter engagement, subscribe conversion — not virality score per segment.
- Default caption style is **clean YouTube CC** (white text, black outline, bottom center). Karaoke word-highlight stays in the Shorts tab only.

**Architecture**
- Extend `AppView` to `"shorts" | "longform" | "settings"` (rename current `home` → `shorts` for clarity).
- New Sidebar entry + full-width `LongFormEditorPage.tsx` (drop `max-w-6xl` for this view).
- New Zustand store `useLongFormStore.ts` (timeline, playhead, undo stack) — do not overload Shorts state.
- New DB table `longform_edits` with `timeline_json` (EDL). Do **not** store long-form cuts in `clips` (AI suggestions ≠ user edit decisions).
- Shared: import, `projects.transcript_json`, `app-video://`, FFmpeg progress-queue pattern.
- New IPC (four-file lockstep): `longform:getEdits`, `longform:saveEdits`, `longform:export:start` / `:progress` / `:complete` / `:error`, `longform:extractWaveform`.
- New or extended Python render path: EDL → **16:9** H.264 (not the vertical `editor.py` crop pipeline). Prefer `--mode longform` on the editor binary or a dedicated `longform_renderer.py`.

**Edit timeline model (v1)**
```typescript
interface LongFormTimeline {
  version: 1;
  fps: number;
  output: { width: 1920; height: 1080; fps: 30 }; // 16:9 YouTube default
  segments: Array<{
    id: string;
    sourceStartMs: number;
    sourceEndMs: number;
    track: "video" | "broll" | "audio";
  }>;
  captions: { style: "clean-youtube"; wordsFromTranscript: true };
  chapters: Array<{ startMs: number; title: string }>; // first must be 0:00
  audio: { normalizeLufs: -14; noiseReduction?: number };
}
```

**Tier 1 features (MVP checklist)**
- [x] Sidebar **Long-Form Editor** tab + full-width editor page shell.
- [x] Content preset: **Talking Head** only (Podcast / Tutorial / Vlog deferred to Phase 8).
- [x] Transcript panel synced to playhead; click word → seek; search transcript → jump.
- [x] **Text-based cut**: select transcript range → delete → ripple-close gap on timeline.
- [x] **Remove Filler Words** (um / uh / like) — one-click remove *(preview/confirm UI deferred)*.
- [x] **Remove Long Silences** (thresholds: 0.5s / 1s / 2s).
- [x] Single video track + playhead; split at playhead *(waveform lane deferred to Phase 8)*.
- [x] Ripple delete; undo/redo (50+ steps); J/K/L-style speed + 0.5x/1x/1.5x/2x controls.
- [x] Chapter markers → copy YouTube-formatted list (`0:00 Intro` …).
- [x] **Export SRT** from transcript remapped to edited timeline (sidecar).
- [x] Audio: volume + **Normalize Loudness (−14 LUFS)** on export *(noise-reduction slider deferred)*.
- [x] Visual: basic color (exposure / contrast / saturation) applied on export.
- [ ] Lower thirds (3 presets) + simple title card.
- [x] Export: **YouTube 1080p** preset (H.264 + AAC, 16:9 pad/scale); progress; thumbnail frame grab.
- [x] YouTube Metadata Panel (title, description, tags, chapters paste).
- [x] Project autosave of `timeline_json`.

> *Implementation note (July 2026): Phase 7 MVP ships as `LongFormEditorPage` + `useLongFormStore` + `electron/longform-export.ts` (FFmpeg EDL concat in main process). `AppView` keeps `"home"` for Shorts Clipper and adds `"longform"`.*

**Anti-features (explicitly out of Long-Form tab)**
- Virality score / clip ranking UI, auto 9:16 reframe, karaoke captions as default, beat-sync auto-cut, 50+ transitions, AI emoji captions, credit-meter AI UX, node-based color, full motion-graphics suite.

**Exit criteria:** User can open a transcribed project in Long-Form, rough-cut via transcript (fillers + silences), add chapters, export one 16:9 master + SRT + chapter list + thumbnail, without touching the Shorts pipeline.

### Phase 8: Long-Form Multi-Track Polish & Content Presets
- [ ] B-roll overlay track (PiP or full replace) + Replace Edit on selected range.
- [ ] Music track with fade in/out + **Auto Ducking** (music under dialogue).
- [ ] J-cut / L-cut (unlink audio/video); speed change 0.5x–2x (pitch-corrected option); freeze frame.
- [ ] Transitions: **Cut + Cross Dissolve only** (intentional restraint for YouTube pacing).
- [ ] Nested / compound clips for intro + main + outro / sponsor blocks.
- [ ] Proxy / low-res preview toggle for 4K long sources.
- [ ] Content presets:
  - **Podcast / Interview** — multicam sync (2–4 angles) + speaker labels (diarization) + lower thirds.
  - **Tutorial / Screencast** — screen + webcam tracks, zoom-n-pan keyframes, callouts/arrows, cursor emphasis.
  - **Vlog / Documentary** — B-roll-forward layout + music ducking defaults.
- [ ] Caption translation (1+ languages) as optional post-process.
- [ ] **Send to Shorts Clipper** bridge after long-form export (or from source + EDL).

**Exit criteria:** Talking-head + podcast + tutorial presets feel purpose-built; multi-track edit exports cleanly; bridge into Shorts works.

### Phase 9: Long-Form Advanced (optional)
- [ ] LUT (.cube) import; HSL skin-tone fix.
- [ ] Visual compressor/limiter; room-tone extend for smooth audio edits.
- [ ] Keyframed position / scale / opacity (Ken Burns, animated PiP).
- [ ] Green screen / background remove for webcam tutorials.
- [ ] Direct Upload to YouTube (API) — overlaps Future Feature Drop v1.2.
- [ ] Version history / timeline snapshots; XML/EDL export for Premiere/Resolve handoff.
- [ ] AI rough-cut assist ("remove bad takes") with mandatory preview/confirm.
- [ ] Gaming mode: death/kill marker detection (niche).

---

## Long-Form vs Shorts — Feature Separation

| Dimension | Shorts Clipper (shipped) | Long-Form Editor (planned) |
|-----------|--------------------------|----------------------------|
| **Primary output** | Many clips, 9:16, 15–60s | One master, 16:9, 10–60+ min |
| **Edit unit** | Hook / punchline / visual beat | Sentence / paragraph / scene |
| **Captions** | Karaoke burn-in | Clean CC + SRT upload; optional burn-in |
| **AI value** | Find + score viral moments | Remove fillers/silences, chapters, rough cut |
| **Timeline** | Per-clip trim + crop pan | Multi-track EDL + transcript-native cuts |
| **Persistence** | `clips` rows | `longform_edits.timeline_json` |
| **Export binary** | Vertical `editor.py` pipeline | Long-form 16:9 EDL renderer |
| **Success metric** | Views / share / hook retention | AVD%, chapter engagement, subs |

```
Import → Transcribe (shared)
              ├─ Shorts Clipper → AI analyze → rank → 9:16 export
              └─ Long-Form Editor → transcript cut → polish → 16:9 + SRT + chapters
                                        └─ (optional) Send to Shorts Clipper
```

---

## AI Prompt Strategy

### Gemini System Prompt Template

```text
You are an expert content editor who specializes in identifying viral short-form video clips for YouTube Shorts and TikTok.

USER'S CREATIVE BRIEF:
"{creative_brief}"

VIDEO TYPE:
{video_type}

TASK:
Analyze the following video segment and evaluate it as a potential short-form clip.

EVALUATION CRITERIA:
1. Hook Strength (1-10): Does the first 3 seconds grab attention?
2. Brief Relevance (1-10): How well does it match the user's creative brief?
3. Self-Containment (1-10): Can a new viewer understand it without context?
4. Emotional Arc (1-10): Does it have surprise, humor, tension, or excitement?
5. Platform Fit (1-10): Is the pacing right for {platform}?

OUTPUT FORMAT (JSON):
{
  "title": " catchy 5-7 word title",
  "description": "1-2 sentence description of the moment",
  "hook_strength": 8,
  "brief_relevance": 9,
  "self_containment": 7,
  "emotional_arc": 8,
  "platform_fit": 9,
  "overall_score": 8.2,
  "reasoning": "Brief explanation of why this clip works or doesn't"
}
```

### Ollama Prompt Template

Similar structure adapted for text-based vision models. The prompt includes a description of the video segment (since local models may not have native video input yet, we may send keyframes + transcript text).

---

## "Free AI" Cost Model

| Task | Solution | Cost |
|------|----------|------|
| Transcription | faster-whisper (local) | **$0** forever |
| Clip Analysis (default) | Ollama + local models | **$0** (uses your own RAM/GPU, offline, no limits) |
| Clip Analysis (optional) | Google Gemini Flash (free tier) | **$0** (free-tier daily/RPM limits apply) |
| Captions | Derived from local transcript | **$0** forever |

**Ollama is the default provider** so users never have to worry about changing Gemini "free tiers" — analysis works fully offline out of the box. Gemini is an optional opt-in (paste a free API key in Settings) for users who prefer cloud quality. For a 30-minute video, expect ~20 candidate segments; the two-pass flow keeps Gemini requests minimal if used.

---

## Future Feature Drops

### v1.1 — Smart Face-Tracking Crop
- Replace center-crop with dynamic face/speaker tracking using OpenCV + MediaPipe.
- The 9:16 crop window pans to keep the active speaker centered.
- *Applies to Shorts Clipper export; Long-Form stays 16:9.*

### v1.2 — Direct Upload Integration
- One-click "Upload to YouTube" (long-form master) and "Upload to YouTube Shorts / TikTok" (clips) via platform APIs.
- Auto-fill title, description, tags, and chapters from AI / Long-Form Metadata Panel.

### v1.3 — Multi-Language Support
- Transcription and caption generation in Spanish, French, German, Japanese, etc.
- Auto-detect spoken language.
- Long-Form caption translation (Phase 8) builds on this.

### v1.4 — Template Store
- Pre-built creative brief templates for popular niches (Gaming Highlights, Cooking Tips, Fitness Motivation, React Videos).
- Community-submitted templates.
- Long-Form: caption style + lower-third + title-card packs per niche.

### v1.5 — Advanced Analytics
- Track which exported clips performed best after upload (requires API integration).
- Feed performance data back to refine AI ranking algorithm.
- Long-Form: optional chapter-level retention insights after YouTube API linking.

### v1.6 — Long-Form Editor (see Phases 7–9)
- Dedicated tab for 16:9 YouTube assembly with transcript-native editing.
- Canonical checklist lives under **Development Phases → Phase 7 / 8 / 9** above.

---

## Tradeoffs & Considerations

| Topic | Decision |
|-------|----------|
| **Bundle Size** | ~150–300 MB due to Electron + FFmpeg + Whisper models. Standard for video editors. |
| **Performance** | Long videos (1–3 hours) need patience. Gemini analysis may take 30–60 seconds per video. We'll show progress spinners and allow background processing. Long-Form timeline uses proxies for 4K sources (Phase 8). |
| **Smart Crop** | v1 uses center-crop for speed and reliability. Face-tracking is computationally heavier and reserved for v1.1. |
| **Offline Capability** | Transcription is always offline. AI analysis requires internet unless Ollama is configured. |
| **Two editors, not one** | Shorts and Long-Form stay separate tabs. Merging virality UI into long-form (or karaoke captions into 16:9 masters) confuses the product. Bridge via "Send to Shorts Clipper" instead. |
| **NLE depth** | Long-Form MVP is transcript-first (Descript-class), not Premiere-class. Multicam, zoom-n-pan, and LUTs land in Phases 8–9 only if Talking Head MVP proves sticky. |
| **Transitions & effects** | Long-form YouTube is ~99% hard cuts. Ship Cut + Cross Dissolve only; refuse CapCut-style effect libraries in the Long-Form tab. |

---

## Next Steps

1. ✅ Finalize this plan.
2. ✅ Set up the Electron + Vite + React scaffold (Phase 1).
3. ✅ Package faster-whisper transcriber + transcription pipeline (Phase 2).
4. ✅ Build the Creative Brief, Video Type selector, and Gemini/Ollama analysis pipeline (Phase 3).
5. ✅ Implement ranking, thumbnails, and the clip preview player (Phase 4).
6. ✅ Auto-edit & export — trim, 9:16 crop, karaoke captions, FFmpeg render queue (Phase 5).
7. 🔄 Bundle FFmpeg for macOS & Windows + settings/error handling + `.dmg`/`.exe` packaging (Phase 6).
8. 📋 Long-Form Editor tab — transcript-native MVP (Phase 7).
9. 📋 Long-Form multi-track polish + content presets (Phase 8).
10. 📋 Long-Form advanced / handoff features (Phase 9, optional).

---

*Plan created: June 15, 2026*
*Long-Form Editor roadmap added: July 19, 2026*
*Target platforms: macOS (dev), Windows (primary audience)*
