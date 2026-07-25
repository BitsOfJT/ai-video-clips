import { create } from "zustand";
import { IPC_CHANNELS } from "@/constants";
import type { ElectronChannel, Project, TranscriptSegment } from "@/types/electron";
import {
  createDefaultTimeline,
  createSegmentId,
  deleteSourceRange,
  splitAtSource,
  totalDurationMs,
  timelineToSourceMs,
  validateTimeline,
  type LongFormTimeline,
} from "@/lib/longform-timeline";
import {
  findFillerRanges,
  findSilenceRanges,
  sortRangesDescending,
  type TimedRange,
} from "@/renderer/lib/longform-fillers";

export type { TimedRange };

async function invokeIpc<T>(channel: ElectronChannel, ...args: unknown[]): Promise<T> {
  return window.electronAPI.invoke<T>(channel, ...args);
}

const MAX_HISTORY = 50;

interface LongFormState {
  timeline: LongFormTimeline | null;
  projectId: string | null;
  playheadMs: number;
  sourcePlayheadMs: number;
  isPlaying: boolean;
  playbackRate: number;
  selectedWordRange: { startMs: number; endMs: number } | null;
  history: LongFormTimeline[];
  future: LongFormTimeline[];
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  exportStatus: "idle" | "rendering" | "completed" | "failed";
  exportProgress: number;
  exportError: string | null;
  exportOutputPath: string | null;
  silenceThresholdSec: 0.5 | 1 | 2;
  pendingFillerCount: number;
  pendingSilenceCount: number;

  loadForProject: (project: Project) => Promise<void>;
  reset: () => void;
  setPlayheadMs: (timelineMs: number) => void;
  setSourcePlayheadMs: (sourceMs: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setSelectedWordRange: (range: { startMs: number; endMs: number } | null) => void;
  setSilenceThresholdSec: (sec: 0.5 | 1 | 2) => void;
  pushTimeline: (next: LongFormTimeline) => void;
  undo: () => void;
  redo: () => void;
  deleteSelectedRange: () => void;
  deleteRanges: (ranges: TimedRange[]) => void;
  splitAtPlayhead: () => void;
  removeFillers: (segments: TranscriptSegment[]) => number;
  removeSilences: (segments: TranscriptSegment[], mediaDurationSec: number) => number;
  addChapterAtPlayhead: (title: string) => void;
  updateChapter: (id: string, patch: { title?: string; startMs?: number }) => void;
  removeChapter: (id: string) => void;
  updateMetadata: (patch: Partial<LongFormTimeline["metadata"]>) => void;
  updateColor: (patch: Partial<LongFormTimeline["color"]>) => void;
  updateAudio: (patch: Partial<LongFormTimeline["audio"]>) => void;
  save: () => Promise<void>;
  startExport: () => Promise<void>;
  cancelExport: () => Promise<void>;
  saveSrt: (srtContent: string) => Promise<string | null>;
  saveThumbnail: (sourceTimeSec: number) => Promise<string | null>;
}

let longformListenersRegistered = false;

function registerLongformListeners(
  set: (partial: Partial<LongFormState> | ((s: LongFormState) => Partial<LongFormState>)) => void
): void {
  if (longformListenersRegistered || typeof window.electronAPI === "undefined") return;
  longformListenersRegistered = true;

  window.electronAPI.onLongformExportProgress((payload) => {
    set((state) =>
      state.projectId === payload.projectId
        ? { exportProgress: payload.percent, exportStatus: "rendering" }
        : {}
    );
  });
  window.electronAPI.onLongformExportComplete((payload) => {
    set((state) =>
      state.projectId === payload.projectId
        ? {
            exportStatus: "completed",
            exportProgress: 100,
            exportOutputPath: payload.outputPath,
            exportError: null,
          }
        : {}
    );
  });
  window.electronAPI.onLongformExportError((payload) => {
    set((state) =>
      state.projectId === payload.projectId
        ? { exportStatus: "failed", exportError: payload.error }
        : {}
    );
  });
}

export const useLongFormStore = create<LongFormState>((set, get) => {
  registerLongformListeners(set);

  return {
    timeline: null,
    projectId: null,
    playheadMs: 0,
    sourcePlayheadMs: 0,
    isPlaying: false,
    playbackRate: 1,
    selectedWordRange: null,
    history: [],
    future: [],
    dirty: false,
    saving: false,
    saveError: null,
    exportStatus: "idle",
    exportProgress: 0,
    exportError: null,
    exportOutputPath: null,
    silenceThresholdSec: 1,
    pendingFillerCount: 0,
    pendingSilenceCount: 0,

    loadForProject: async (project) => {
      const projectId = project.id;
      let timeline = createDefaultTimeline(project.duration_sec ?? 0, project.title ?? "");
      try {
        const raw = await invokeIpc<{ timelineJson: string | null } | null>(
          IPC_CHANNELS.LONGFORM_GET_EDITS,
          projectId
        );
        if (raw?.timelineJson) {
          const parsed = validateTimeline(JSON.parse(raw.timelineJson) as unknown);
          if (parsed && parsed.segments.length > 0) {
            timeline = parsed;
          }
        }
      } catch {
        // Fall back to default timeline
      }

      let pendingFillerCount = 0;
      let pendingSilenceCount = 0;
      if (project.transcript_json) {
        try {
          const parsed = JSON.parse(project.transcript_json) as { segments: TranscriptSegment[] };
          pendingFillerCount = findFillerRanges(parsed.segments ?? []).length;
          pendingSilenceCount = findSilenceRanges(
            parsed.segments ?? [],
            get().silenceThresholdSec,
            project.duration_sec ?? undefined
          ).length;
        } catch {
          // ignore
        }
      }

      set({
        projectId,
        timeline,
        playheadMs: 0,
        sourcePlayheadMs: 0,
        isPlaying: false,
        selectedWordRange: null,
        history: [],
        future: [],
        dirty: false,
        saveError: null,
        exportStatus: "idle",
        exportProgress: 0,
        exportError: null,
        exportOutputPath: null,
        pendingFillerCount,
        pendingSilenceCount,
      });
    },

    reset: () =>
      set({
        timeline: null,
        projectId: null,
        playheadMs: 0,
        sourcePlayheadMs: 0,
        isPlaying: false,
        selectedWordRange: null,
        history: [],
        future: [],
        dirty: false,
      }),

    setPlayheadMs: (timelineMs) => {
      const { timeline } = get();
      if (!timeline) {
        set({ playheadMs: timelineMs });
        return;
      }
      const source = timelineToSourceMs(timelineMs, timeline.segments);
      set({
        playheadMs: Math.max(0, Math.min(timelineMs, totalDurationMs(timeline.segments))),
        sourcePlayheadMs: source ?? 0,
      });
    },

    setSourcePlayheadMs: (sourceMs) => set({ sourcePlayheadMs: sourceMs }),
    setIsPlaying: (playing) => set({ isPlaying: playing }),
    setPlaybackRate: (rate) => set({ playbackRate: rate }),
    setSelectedWordRange: (range) => set({ selectedWordRange: range }),
    setSilenceThresholdSec: (sec) => set({ silenceThresholdSec: sec }),

    pushTimeline: (next) => {
      const { timeline, history } = get();
      const nextHistory = timeline
        ? [...history, timeline].slice(-MAX_HISTORY)
        : history;
      set({
        timeline: next,
        history: nextHistory,
        future: [],
        dirty: true,
      });
    },

    undo: () => {
      const { history, timeline, future } = get();
      if (history.length === 0 || !timeline) return;
      const prev = history[history.length - 1];
      set({
        timeline: prev,
        history: history.slice(0, -1),
        future: [timeline, ...future].slice(0, MAX_HISTORY),
        dirty: true,
      });
    },

    redo: () => {
      const { future, timeline, history } = get();
      if (future.length === 0 || !timeline) return;
      const next = future[0];
      set({
        timeline: next,
        future: future.slice(1),
        history: [...history, timeline].slice(-MAX_HISTORY),
        dirty: true,
      });
    },

    deleteSelectedRange: () => {
      const { timeline, selectedWordRange } = get();
      if (!timeline || !selectedWordRange) return;
      get().pushTimeline(
        deleteSourceRange(timeline, selectedWordRange.startMs, selectedWordRange.endMs)
      );
      set({ selectedWordRange: null });
    },

    deleteRanges: (ranges) => {
      const { timeline } = get();
      if (!timeline || ranges.length === 0) return;
      let next = timeline;
      for (const range of sortRangesDescending(ranges)) {
        next = deleteSourceRange(next, range.startMs, range.endMs);
      }
      get().pushTimeline(next);
    },

    splitAtPlayhead: () => {
      const { timeline, sourcePlayheadMs } = get();
      if (!timeline) return;
      get().pushTimeline({
        ...timeline,
        segments: splitAtSource(timeline.segments, sourcePlayheadMs),
      });
    },

    removeFillers: (segments) => {
      const ranges = findFillerRanges(segments);
      get().deleteRanges(ranges);
      set({ pendingFillerCount: 0 });
      return ranges.length;
    },

    removeSilences: (segments, mediaDurationSec) => {
      const ranges = findSilenceRanges(segments, get().silenceThresholdSec, mediaDurationSec);
      get().deleteRanges(ranges);
      set({ pendingSilenceCount: 0 });
      return ranges.length;
    },

    addChapterAtPlayhead: (title) => {
      const { timeline, playheadMs } = get();
      if (!timeline) return;
      const chapter = {
        id: createSegmentId(),
        startMs: Math.round(playheadMs),
        title: title.trim() || "Chapter",
      };
      const chapters = [...timeline.chapters, chapter].sort((a, b) => a.startMs - b.startMs);
      get().pushTimeline({ ...timeline, chapters });
    },

    updateChapter: (id, patch) => {
      const { timeline } = get();
      if (!timeline) return;
      get().pushTimeline({
        ...timeline,
        chapters: timeline.chapters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      });
    },

    removeChapter: (id) => {
      const { timeline } = get();
      if (!timeline) return;
      const chapters = timeline.chapters.filter((c) => c.id !== id);
      const ensured =
        chapters.some((c) => c.startMs === 0)
          ? chapters
          : [{ id: createSegmentId(), startMs: 0, title: "Intro" }, ...chapters];
      get().pushTimeline({ ...timeline, chapters: ensured });
    },

    updateMetadata: (patch) => {
      const { timeline } = get();
      if (!timeline) return;
      get().pushTimeline({
        ...timeline,
        metadata: { ...timeline.metadata, ...patch },
      });
    },

    updateColor: (patch) => {
      const { timeline } = get();
      if (!timeline) return;
      get().pushTimeline({
        ...timeline,
        color: { ...timeline.color, ...patch },
      });
    },

    updateAudio: (patch) => {
      const { timeline } = get();
      if (!timeline) return;
      get().pushTimeline({
        ...timeline,
        audio: { ...timeline.audio, ...patch },
      });
    },

    save: async () => {
      const { projectId, timeline } = get();
      if (!projectId || !timeline) return;
      set({ saving: true, saveError: null });
      try {
        await invokeIpc(IPC_CHANNELS.LONGFORM_SAVE_EDITS, projectId, JSON.stringify(timeline));
        set({ dirty: false, saving: false });
      } catch (err) {
        set({
          saving: false,
          saveError: err instanceof Error ? err.message : "Failed to save edits",
        });
      }
    },

    startExport: async () => {
      const { projectId, timeline } = get();
      if (!projectId || !timeline) return;
      await get().save();
      set({
        exportStatus: "rendering",
        exportProgress: 0,
        exportError: null,
        exportOutputPath: null,
      });
      try {
        const started = await invokeIpc<boolean>(
          IPC_CHANNELS.LONGFORM_EXPORT_START,
          projectId,
          JSON.stringify(timeline)
        );
        if (!started) {
          set({ exportStatus: "idle", exportProgress: 0 });
        }
      } catch (err) {
        set({
          exportStatus: "failed",
          exportError: err instanceof Error ? err.message : "Export failed to start",
        });
      }
    },

    cancelExport: async () => {
      const { projectId } = get();
      if (!projectId) return;
      await invokeIpc(IPC_CHANNELS.LONGFORM_EXPORT_CANCEL, projectId);
      set({ exportStatus: "idle", exportProgress: 0 });
    },

    saveSrt: async (srtContent) => {
      const { projectId } = get();
      if (!projectId) return null;
      return invokeIpc<string | null>(IPC_CHANNELS.LONGFORM_SAVE_SRT, projectId, srtContent);
    },

    saveThumbnail: async (sourceTimeSec) => {
      const { projectId } = get();
      if (!projectId) return null;
      return invokeIpc<string | null>(
        IPC_CHANNELS.LONGFORM_SAVE_THUMBNAIL,
        projectId,
        sourceTimeSec
      );
    },
  };
});
