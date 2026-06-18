# AI Video Clipper — Project Plan

## Overview

A cross-platform desktop application that takes long-form videos and uses AI to automatically find, rank, and edit the best short-form clips for YouTube Shorts and TikTok. The app features a **Creative Brief** input where users describe what they're looking for (funny clips, action moments, emotional peaks, etc.) to guide the AI's recommendations.

---

## Core Concept

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
│   │   ├── EditorPanel.tsx           # Manual trim/crop adjustments
│   │   └── ExportQueue.tsx           # Batch export status and progress
│   ├── hooks/
│   │   ├── useVideoAnalysis.ts       # Orchestrates transcribe → analyze → rank flow
│   │   └── useExportQueue.ts         # Manages FFmpeg render jobs
│   ├── store/
│   │   └── useAppStore.ts            # Zustand global state
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

### v1.2 — Direct Upload Integration
- One-click "Upload to YouTube Shorts" and "Upload to TikTok" via platform APIs.
- Auto-fill title and description from AI-generated metadata.

### v1.3 — Multi-Language Support
- Transcription and caption generation in Spanish, French, German, Japanese, etc.
- Auto-detect spoken language.

### v1.4 — Template Store
- Pre-built creative brief templates for popular niches (Gaming Highlights, Cooking Tips, Fitness Motivation, React Videos).
- Community-submitted templates.

### v1.5 — Advanced Analytics
- Track which exported clips performed best after upload (requires API integration).
- Feed performance data back to refine AI ranking algorithm.

---

## Tradeoffs & Considerations

| Topic | Decision |
|-------|----------|
| **Bundle Size** | ~150–300 MB due to Electron + FFmpeg + Whisper models. Standard for video editors. |
| **Performance** | Long videos (1–3 hours) need patience. Gemini analysis may take 30–60 seconds per video. We'll show progress spinners and allow background processing. |
| **Smart Crop** | v1 uses center-crop for speed and reliability. Face-tracking is computationally heavier and reserved for v1.1. |
| **Offline Capability** | Transcription is always offline. AI analysis requires internet unless Ollama is configured. |

---

## Next Steps

1. ✅ Finalize this plan.
2. ✅ Set up the Electron + Vite + React scaffold (Phase 1).
3. ✅ Package faster-whisper transcriber + transcription pipeline (Phase 2).
4. ✅ Build the Creative Brief, Video Type selector, and Gemini/Ollama analysis pipeline (Phase 3).
5. ✅ Implement ranking, thumbnails, and the clip preview player (Phase 4).
6. ✅ Auto-edit & export — trim, 9:16 crop, karaoke captions, FFmpeg render queue (Phase 5).
7. 🔄 Bundle FFmpeg for macOS & Windows + settings/error handling + `.dmg`/`.exe` packaging (Phase 6).

---

*Plan created: June 15, 2026*
*Target platforms: macOS (dev), Windows (primary audience)*
