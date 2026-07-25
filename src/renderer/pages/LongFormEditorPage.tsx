import { useEffect, useRef, useState } from "react";
import {
  Download,
  Film,
  Image,
  Loader2,
  Pause,
  Play,
  Redo2,
  Save,
  Scissors,
  SkipForward,
  Subtitles,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import { Label } from "@/renderer/components/ui/label";
import { Textarea } from "@/renderer/components/ui/textarea";
import { ScrollArea } from "@/renderer/components/ui/scroll-area";
import { useAppStore } from "@/renderer/store/useAppStore";
import { useLongFormStore } from "@/renderer/store/useLongFormStore";
import { toAppVideoUrl } from "@/lib/app-video-url";
import {
  sourceToTimelineMs,
  totalDurationMs,
  timelineToSourceMs,
} from "@/lib/longform-timeline";
import { buildSrtFromTranscript, formatYoutubeChapters } from "@/renderer/lib/longform-captions";
import { findFillerRanges, findSilenceRanges } from "@/renderer/lib/longform-fillers";
import { cn } from "@/renderer/lib/utils";
import type { TranscriptSegment } from "@/types/electron";
import { IPC_CHANNELS } from "@/constants";

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const frac = Math.floor((ms % 1000) / 100);
  return `${m}:${s.toString().padStart(2, "0")}.${frac}`;
}

export default function LongFormEditorPage() {
  const projects = useAppStore((s) => s.projects);
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const setView = useAppStore((s) => s.setView);
  const project = projects.find((p) => p.id === currentProjectId);

  const timeline = useLongFormStore((s) => s.timeline);
  const playheadMs = useLongFormStore((s) => s.playheadMs);
  const sourcePlayheadMs = useLongFormStore((s) => s.sourcePlayheadMs);
  const isPlaying = useLongFormStore((s) => s.isPlaying);
  const playbackRate = useLongFormStore((s) => s.playbackRate);
  const selectedWordRange = useLongFormStore((s) => s.selectedWordRange);
  const dirty = useLongFormStore((s) => s.dirty);
  const saving = useLongFormStore((s) => s.saving);
  const exportStatus = useLongFormStore((s) => s.exportStatus);
  const exportProgress = useLongFormStore((s) => s.exportProgress);
  const exportError = useLongFormStore((s) => s.exportError);
  const exportOutputPath = useLongFormStore((s) => s.exportOutputPath);
  const silenceThresholdSec = useLongFormStore((s) => s.silenceThresholdSec);
  const pendingFillerCount = useLongFormStore((s) => s.pendingFillerCount);
  const pendingSilenceCount = useLongFormStore((s) => s.pendingSilenceCount);

  const loadForProject = useLongFormStore((s) => s.loadForProject);
  const setPlayheadMs = useLongFormStore((s) => s.setPlayheadMs);
  const setSourcePlayheadMs = useLongFormStore((s) => s.setSourcePlayheadMs);
  const setIsPlaying = useLongFormStore((s) => s.setIsPlaying);
  const setPlaybackRate = useLongFormStore((s) => s.setPlaybackRate);
  const setSelectedWordRange = useLongFormStore((s) => s.setSelectedWordRange);
  const setSilenceThresholdSec = useLongFormStore((s) => s.setSilenceThresholdSec);
  const undo = useLongFormStore((s) => s.undo);
  const redo = useLongFormStore((s) => s.redo);
  const deleteSelectedRange = useLongFormStore((s) => s.deleteSelectedRange);
  const splitAtPlayhead = useLongFormStore((s) => s.splitAtPlayhead);
  const removeFillers = useLongFormStore((s) => s.removeFillers);
  const removeSilences = useLongFormStore((s) => s.removeSilences);
  const addChapterAtPlayhead = useLongFormStore((s) => s.addChapterAtPlayhead);
  const updateChapter = useLongFormStore((s) => s.updateChapter);
  const removeChapter = useLongFormStore((s) => s.removeChapter);
  const updateMetadata = useLongFormStore((s) => s.updateMetadata);
  const updateColor = useLongFormStore((s) => s.updateColor);
  const updateAudio = useLongFormStore((s) => s.updateAudio);
  const save = useLongFormStore((s) => s.save);
  const startExport = useLongFormStore((s) => s.startExport);
  const cancelExport = useLongFormStore((s) => s.cancelExport);
  const saveSrt = useLongFormStore((s) => s.saveSrt);
  const saveThumbnail = useLongFormStore((s) => s.saveThumbnail);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const selectionAnchor = useRef<number | null>(null);

  const transcriptJson = project?.transcript_json ?? null;
  const transcriptSegments = (() => {
    if (!transcriptJson) return [] as TranscriptSegment[];
    try {
      const parsed = JSON.parse(transcriptJson) as { segments: TranscriptSegment[] };
      return parsed.segments ?? [];
    } catch {
      return [] as TranscriptSegment[];
    }
  })();

  useEffect(() => {
    if (!currentProjectId) return;
    const p = useAppStore.getState().projects.find((x) => x.id === currentProjectId);
    if (p) void loadForProject(p);
  }, [currentProjectId, loadForProject]);

  // Autosave when dirty
  useEffect(() => {
    if (!dirty || !timeline) return;
    const t = window.setTimeout(() => {
      void save();
    }, 1500);
    return () => window.clearTimeout(t);
  }, [dirty, timeline, save]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (e.key === " " || e.key === "k") {
        e.preventDefault();
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) void v.play();
        else v.pause();
      } else if (e.key === "j") {
        setPlaybackRate(Math.max(0.5, playbackRate - 0.5));
      } else if (e.key === "l") {
        setPlaybackRate(Math.min(2, playbackRate + 0.5));
      } else if (e.key === "b") {
        e.preventDefault();
        splitAtPlayhead();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedWordRange) {
          e.preventDefault();
          deleteSelectedRange();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    undo,
    redo,
    playbackRate,
    setPlaybackRate,
    splitAtPlayhead,
    selectedWordRange,
    deleteSelectedRange,
  ]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = playbackRate;
  }, [playbackRate]);

  // Keep video within kept segments while playing
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !timeline) return;

    const onTimeUpdate = () => {
      const sourceMs = Math.round(v.currentTime * 1000);
      setSourcePlayheadMs(sourceMs);
      const tl = sourceToTimelineMs(sourceMs, timeline.segments);
      if (tl !== null) {
        setPlayheadMs(tl);
      } else {
        // Cut region — jump to next kept segment
        const next = timeline.segments.find((s) => s.sourceStartMs >= sourceMs);
        if (next) {
          v.currentTime = next.sourceStartMs / 1000;
        } else {
          v.pause();
          setIsPlaying(false);
        }
      }
    };

    v.addEventListener("timeupdate", onTimeUpdate);
    return () => v.removeEventListener("timeupdate", onTimeUpdate);
  }, [timeline, setPlayheadMs, setSourcePlayheadMs, setIsPlaying]);

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Film className="h-10 w-10 text-muted-foreground/50" />
        <h1 className="text-lg font-semibold">Long-Form Editor</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Select a project from the sidebar to edit a full YouTube video. Import and transcribe
          first in the Shorts Clipper tab if needed.
        </p>
        <Button variant="outline" onClick={() => setView("home")}>
          Go to Shorts Clipper
        </Button>
      </div>
    );
  }

  if (!timeline) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading timeline…
      </div>
    );
  }

  const durationMs = totalDurationMs(timeline.segments);
  const videoSrc = toAppVideoUrl(project.video_path);
  const chaptersText = formatYoutubeChapters(timeline.chapters);

  const seekToSourceMs = (sourceMs: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = sourceMs / 1000;
    setSourcePlayheadMs(sourceMs);
    const tl = sourceToTimelineMs(sourceMs, timeline.segments);
    if (tl !== null) setPlayheadMs(tl);
  };

  const seekToTimelineMs = (tlMs: number) => {
    const source = timelineToSourceMs(tlMs, timeline.segments);
    if (source !== null) seekToSourceMs(source);
  };

  const handleWordClick = (startSec: number, endSec: number, shiftKey: boolean) => {
    const startMs = Math.round(startSec * 1000);
    const endMs = Math.round(endSec * 1000);
    seekToSourceMs(startMs);

    if (shiftKey && selectionAnchor.current !== null) {
      setSelectedWordRange({
        startMs: Math.min(selectionAnchor.current, startMs),
        endMs: Math.max(selectionAnchor.current, endMs),
      });
    } else {
      selectionAnchor.current = startMs;
      setSelectedWordRange({ startMs, endMs });
    }
  };

  const filteredSegments = searchQuery.trim()
    ? transcriptSegments.filter((s) =>
        s.text.toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : transcriptSegments;

  const handleExportSrt = async () => {
    const srt = buildSrtFromTranscript(transcriptSegments, timeline.segments);
    const path = await saveSrt(srt);
    if (path) setStatusMsg(`Saved SRT → ${path}`);
  };

  const handleThumbnail = async () => {
    const path = await saveThumbnail(sourcePlayheadMs / 1000);
    if (path) setStatusMsg(`Saved thumbnail → ${path}`);
  };

  const handleCopyChapters = async () => {
    try {
      await navigator.clipboard.writeText(chaptersText);
      setStatusMsg("Chapter list copied to clipboard");
    } catch {
      setStatusMsg("Could not copy chapters");
    }
  };

  const handleRevealExport = async () => {
    if (!exportOutputPath) return;
    await window.electronAPI.invoke(IPC_CHANNELS.SHELL_SHOW_ITEM, exportOutputPath);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <div className="mr-2 min-w-0">
          <div className="truncate text-sm font-semibold">
            {project.title || "Untitled"} · Talking Head
          </div>
          <div className="text-[10px] text-muted-foreground">
            {dirty ? (saving ? "Saving…" : "Unsaved changes") : "Saved"}
            {" · "}
            {formatClock(durationMs)} edited
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={() => undo()} title="Undo (⌘Z)">
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => redo()} title="Redo">
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => splitAtPlayhead()} title="Split (B)">
          <Scissors className="h-3.5 w-3.5" />
          Split
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!selectedWordRange}
          onClick={() => deleteSelectedRange()}
          title="Delete selection"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Cut selection
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button
          variant="outline"
          size="sm"
          disabled={transcriptSegments.length === 0}
          onClick={() => {
            const n = removeFillers(transcriptSegments);
            setStatusMsg(n ? `Removed ${n} filler range(s)` : "No fillers found");
          }}
        >
          Remove fillers{pendingFillerCount ? ` (${pendingFillerCount})` : ""}
        </Button>

        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={silenceThresholdSec}
          onChange={(e) => setSilenceThresholdSec(Number(e.target.value) as 0.5 | 1 | 2)}
          title="Silence threshold"
        >
          <option value={0.5}>Silence ≥0.5s</option>
          <option value={1}>Silence ≥1s</option>
          <option value={2}>Silence ≥2s</option>
        </select>
        <Button
          variant="outline"
          size="sm"
          disabled={transcriptSegments.length === 0}
          onClick={() => {
            const n = removeSilences(transcriptSegments, project.duration_sec ?? 0);
            setStatusMsg(n ? `Removed ${n} silence gap(s)` : "No long silences found");
          }}
        >
          Remove silences{pendingSilenceCount ? ` (${pendingSilenceCount})` : ""}
        </Button>

        <div className="flex-1" />

        <Button variant="outline" size="sm" onClick={() => void save()} disabled={saving}>
          <Save className="h-3.5 w-3.5" />
          Save
        </Button>
        <Button variant="outline" size="sm" onClick={() => void handleExportSrt()}>
          <Subtitles className="h-3.5 w-3.5" />
          SRT
        </Button>
        <Button variant="outline" size="sm" onClick={() => void handleThumbnail()}>
          <Image className="h-3.5 w-3.5" />
          Thumbnail
        </Button>
        {exportStatus === "rendering" ? (
          <Button variant="outline" size="sm" onClick={() => void cancelExport()}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {exportProgress}%
          </Button>
        ) : (
          <Button size="sm" onClick={() => void startExport()}>
            <Download className="h-3.5 w-3.5" />
            Export 1080p
          </Button>
        )}
      </div>

      {(statusMsg || exportError || exportOutputPath) && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-4 py-1.5 text-xs">
          {exportError && <span className="text-destructive">{exportError}</span>}
          {exportOutputPath && exportStatus === "completed" && (
            <button type="button" className="text-primary underline" onClick={() => void handleRevealExport()}>
              Export ready — show in folder
            </button>
          )}
          {statusMsg && <span className="text-muted-foreground">{statusMsg}</span>}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_360px]">
        {/* Center: preview + timeline */}
        <div className="flex min-h-0 flex-col border-r border-border">
          <div className="relative flex aspect-video max-h-[42vh] items-center justify-center bg-black">
            <video
              ref={videoRef}
              src={videoSrc}
              className="h-full w-full object-contain"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
          </div>

          <div className="flex items-center gap-3 border-b border-border px-3 py-2">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                if (v.paused) void v.play();
                else v.pause();
              }}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {formatClock(playheadMs)} / {formatClock(durationMs)}
            </span>
            <div className="flex gap-1">
              {[0.5, 1, 1.5, 2].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setPlaybackRate(rate)}
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-[10px]",
                    playbackRate === rate
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>

          {/* Timeline track */}
          <div className="shrink-0 border-b border-border bg-muted/20 px-3 py-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Timeline
            </div>
            <div
              className="relative h-10 cursor-pointer rounded bg-secondary/80"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                seekToTimelineMs(ratio * durationMs);
              }}
            >
              {timeline.segments.map((seg) => {
                const start = sourceToTimelineMs(seg.sourceStartMs, timeline.segments) ?? 0;
                const width = seg.sourceEndMs - seg.sourceStartMs;
                const leftPct = durationMs > 0 ? (start / durationMs) * 100 : 0;
                const widthPct = durationMs > 0 ? (width / durationMs) * 100 : 0;
                return (
                  <div
                    key={seg.id}
                    className="absolute inset-y-1 rounded-sm bg-primary/70"
                    style={{ left: `${leftPct}%`, width: `${Math.max(0.2, widthPct)}%` }}
                    title={`${formatClock(seg.sourceStartMs)} → ${formatClock(seg.sourceEndMs)}`}
                  />
                );
              })}
              {durationMs > 0 && (
                <div
                  className="absolute inset-y-0 w-0.5 bg-white shadow"
                  style={{ left: `${(playheadMs / durationMs) * 100}%` }}
                />
              )}
            </div>
            {/* Chapter markers */}
            <div className="relative mt-2 h-4">
              {timeline.chapters.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  title={ch.title}
                  className="absolute top-0 -translate-x-1/2 text-[9px] text-amber-400"
                  style={{ left: `${durationMs > 0 ? (ch.startMs / durationMs) * 100 : 0}%` }}
                  onClick={() => seekToTimelineMs(ch.startMs)}
                >
                  ▼
                </button>
              ))}
            </div>
          </div>

          {/* Transcript */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Label className="text-xs font-semibold">Transcript</Label>
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search transcript…"
                className="h-7 max-w-xs text-xs"
              />
              {selectedWordRange && (
                <span className="text-[10px] text-muted-foreground">
                  Selection {formatClock(selectedWordRange.startMs)}–
                  {formatClock(selectedWordRange.endMs)} (Del to cut)
                </span>
              )}
            </div>
            <ScrollArea className="min-h-0 flex-1 p-3">
              {transcriptSegments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No transcript yet. Transcribe this project in the Shorts Clipper tab first —
                  Long-Form editing is transcript-native.
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredSegments.map((segment) => {
                    const kept = sourceToTimelineMs(
                      Math.round(segment.start * 1000),
                      timeline.segments
                    );
                    return (
                      <div
                        key={segment.id}
                        className={cn("text-sm leading-relaxed", kept === null && "opacity-35")}
                      >
                        <div className="mb-0.5 font-mono text-[10px] text-muted-foreground">
                          {formatClock(Math.round(segment.start * 1000))}
                        </div>
                        <p>
                          {segment.words.map((word, idx) => {
                            const wStart = Math.round(word.start * 1000);
                            const wEnd = Math.round(word.end * 1000);
                            const inSelection =
                              selectedWordRange &&
                              wStart >= selectedWordRange.startMs &&
                              wEnd <= selectedWordRange.endMs;
                            const isActive =
                              sourcePlayheadMs >= wStart && sourcePlayheadMs < wEnd;
                            const wordKept =
                              sourceToTimelineMs(wStart, timeline.segments) !== null;
                            return (
                              <span
                                key={`${segment.id}-${idx}-${word.start}`}
                                role="button"
                                tabIndex={0}
                                onClick={(e) => handleWordClick(word.start, word.end, e.shiftKey)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    handleWordClick(word.start, word.end, e.shiftKey);
                                  }
                                }}
                                className={cn(
                                  "inline-block cursor-pointer rounded px-0.5",
                                  !wordKept && "line-through opacity-40",
                                  inSelection && "bg-primary/30",
                                  isActive && "bg-amber-500/30",
                                  "hover:bg-accent"
                                )}
                              >
                                {word.word}
                              </span>
                            );
                          })}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex min-h-0 flex-col overflow-auto p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            YouTube package
          </h2>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="lf-title">Title</Label>
              <Input
                id="lf-title"
                value={timeline.metadata.title}
                onChange={(e) => updateMetadata({ title: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lf-desc">Description</Label>
              <Textarea
                id="lf-desc"
                rows={3}
                value={timeline.metadata.description}
                onChange={(e) => updateMetadata({ description: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lf-tags">Tags</Label>
              <Input
                id="lf-tags"
                value={timeline.metadata.tags}
                onChange={(e) => updateMetadata({ tags: e.target.value })}
                placeholder="comma, separated, tags"
              />
            </div>
          </div>

          <hr className="my-4 border-border" />

          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Chapters
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                addChapterAtPlayhead(chapterTitle || "Chapter");
                setChapterTitle("");
              }}
            >
              <SkipForward className="mr-1 h-3 w-3" />
              Add at playhead
            </Button>
          </div>
          <Input
            className="mb-2 h-7 text-xs"
            placeholder="New chapter title"
            value={chapterTitle}
            onChange={(e) => setChapterTitle(e.target.value)}
          />
          <div className="mb-2 space-y-1">
            {timeline.chapters
              .slice()
              .sort((a, b) => a.startMs - b.startMs)
              .map((ch) => (
                <div key={ch.id} className="flex items-center gap-1">
                  <span className="w-12 shrink-0 font-mono text-[10px] text-muted-foreground">
                    {formatClock(ch.startMs)}
                  </span>
                  <Input
                    className="h-7 text-xs"
                    value={ch.title}
                    onChange={(e) => updateChapter(ch.id, { title: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={ch.startMs === 0}
                    onClick={() => removeChapter(ch.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
          </div>
          <pre className="mb-2 max-h-24 overflow-auto rounded border border-border bg-muted/30 p-2 font-mono text-[10px] text-muted-foreground">
            {chaptersText}
          </pre>
          <Button variant="outline" size="sm" onClick={() => void handleCopyChapters()}>
            Copy chapter list
          </Button>

          <hr className="my-4 border-border" />

          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Color
          </h3>
          {(
            [
              ["exposure", "Exposure"],
              ["contrast", "Contrast"],
              ["saturation", "Saturation"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="mb-2">
              <div className="mb-0.5 flex justify-between text-[10px]">
                <span>{label}</span>
                <span className="font-mono text-muted-foreground">{timeline.color[key].toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.05}
                value={timeline.color[key]}
                onChange={(e) => updateColor({ [key]: Number(e.target.value) })}
                className="w-full accent-primary"
              />
            </div>
          ))}

          <hr className="my-4 border-border" />

          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Audio
          </h3>
          <div className="mb-2">
            <div className="mb-0.5 flex justify-between text-[10px]">
              <span>Volume</span>
              <span className="font-mono text-muted-foreground">
                {timeline.audio.volume.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={timeline.audio.volume}
              onChange={(e) => updateAudio({ volume: Number(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={timeline.audio.normalizeLufs}
              onChange={(e) => updateAudio({ normalizeLufs: e.target.checked })}
            />
            Normalize loudness (−14 LUFS)
          </label>

          <div className="mt-6 rounded-lg border border-dashed border-border p-3 text-[11px] leading-relaxed text-muted-foreground">
            <p className="mb-1 font-semibold text-foreground">Tips</p>
            <ul className="list-inside list-disc space-y-0.5">
              <li>Click words to seek; Shift+click to select a range</li>
              <li>Delete / Backspace cuts the selection (ripple)</li>
              <li>Space / K play · J/L speed · B split</li>
              <li>
                Detected fillers: {findFillerRanges(transcriptSegments).length} · silences:{" "}
                {findSilenceRanges(transcriptSegments, silenceThresholdSec, project.duration_sec ?? 0)
                  .length}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
