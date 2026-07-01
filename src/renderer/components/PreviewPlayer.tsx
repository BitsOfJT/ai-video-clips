import { useEffect, useRef, useState } from "react";
import { X, Play, Pause, Edit, Download } from "lucide-react";
import { Button } from "@/renderer/components/ui/button";
import ExportCaptionsToggle from "@/renderer/components/ExportCaptionsToggle";
import ScoreCriteriaGrid from "@/renderer/components/ScoreCriteriaGrid";
import { cn } from "@/renderer/lib/utils";
import { computeCompositeScore } from "@/renderer/lib/clip-scoring";
import { toAppVideoUrl } from "@/lib/app-video-url";
import { useAppStore } from "@/renderer/store/useAppStore";
import type { Clip, Project } from "@/types/electron";

interface PreviewPlayerProps {
  clip: Clip;
  project: Project;
  onClose: () => void;
  onEdit: () => void;
}

function scoreColor(score: number): string {
  if (score >= 8) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (score >= 6) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PreviewPlayer({ clip, project, onClose, onEdit }: PreviewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const startExport = useAppStore((state) => state.startExport);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState((clip.start_ms ?? 0) / 1000);
  
  // Track loaded video resolution for exact crop mapping
  const [videoWidth, setVideoWidth] = useState(project.width ?? 0);
  const [videoHeight, setVideoHeight] = useState(project.height ?? 0);

  const startSec = (clip.start_ms ?? 0) / 1000;
  const endSec = (clip.end_ms ?? 0) / 1000;
  const durationSec = Math.max(0, endSec - startSec);
  const score = computeCompositeScore(clip);
  const videoSrc = toAppVideoUrl(project.video_path);

  // Calculate crop geometry
  const cropW = videoHeight > 0 ? Math.round(videoHeight * (9 / 16)) : 0;
  const activeCropX = clip.crop_x === undefined || clip.crop_x === null || clip.crop_x === -1
    ? Math.max(0, Math.round((videoWidth - cropW) / 2))
    : clip.crop_x;

  const leftOverlayPct = videoWidth > 0 ? (activeCropX / videoWidth) * 100 : 0;
  const cropWidthPct = videoWidth > 0 ? (cropW / videoWidth) * 100 : 0;
  const rightOverlayPct = 100 - (leftOverlayPct + cropWidthPct);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  function handleLoadedMetadata() {
    const v = videoRef.current;
    if (!v) return;
    if (v.videoWidth > 0) {
      setVideoWidth(v.videoWidth);
      setVideoHeight(v.videoHeight);
    }
  }

  function handleCanPlay() {
    const v = videoRef.current;
    if (!v) return;
    if (Math.abs(v.currentTime - startSec) > 0.25) {
      v.currentTime = startSec;
    }
  }

  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    if (v.currentTime >= endSec) {
      v.pause();
      v.currentTime = startSec;
      setIsPlaying(false);
    }
  }

  function togglePlayPause() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }

  const elapsed = Math.max(0, currentTime - startSec);

  return (
    <div className="fixed right-0 top-0 z-40 flex h-screen w-96 flex-col border-l border-border bg-card shadow-2xl">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="truncate text-sm font-semibold text-foreground">
          {clip.title || "Untitled clip"}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="shrink-0 bg-black">
        <div className="relative overflow-hidden aspect-video">
          <video
            ref={videoRef}
            src={videoSrc}
            className="w-full h-full object-contain"
            onLoadedMetadata={handleLoadedMetadata}
            onCanPlay={handleCanPlay}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
          {videoWidth > 0 && cropW < videoWidth && (
            <>
              <div
                className="pointer-events-none absolute inset-y-0 left-0 bg-black/60 border-r border-dashed border-white/20"
                style={{ width: `${leftOverlayPct}%` }}
              />
              <div
                className="pointer-events-none absolute inset-y-0 right-0 bg-black/60 border-l border-dashed border-white/20"
                style={{ width: `${rightOverlayPct}%` }}
              />
            </>
          )}
        </div>

        <div className="flex items-center gap-3 px-3 py-2 border-b border-border">
          <button
            onClick={togglePlayPause}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <span className="font-mono text-xs tabular-nums text-white/70">
            {formatTime(elapsed)} / {formatTime(durationSec)}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                AI Score
              </span>
              <span
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                  scoreColor(score)
                )}
              >
                {score.toFixed(1)}
              </span>
            </div>

            <ScoreCriteriaGrid clip={clip} variant="panel" />
          </div>

          {clip.description && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Description
              </span>
              <p className="text-sm text-muted-foreground">{clip.description}</p>
            </div>
          )}

          {clip.reasoning && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Reasoning
              </span>
              <p className="text-sm italic text-muted-foreground">{clip.reasoning}</p>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons Panel */}
      <div className="shrink-0 border-t border-border p-4 bg-muted/40 space-y-2">
        <ExportCaptionsToggle />
        <Button onClick={onEdit} variant="outline" className="w-full flex items-center justify-center gap-1.5">
          <Edit className="h-4 w-4" />
          Edit Clip
        </Button>
        <Button
          onClick={() => {
            void startExport(clip.id);
            onClose();
          }}
          className="w-full flex items-center justify-center gap-1.5"
        >
          <Download className="h-4 w-4" />
          Export vertical video
        </Button>
      </div>
    </div>
  );
}
