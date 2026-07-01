import { useEffect, useRef, useState } from "react";
import { X, Play, Pause, Save, Film, Move } from "lucide-react";
import { Button } from "@/renderer/components/ui/button";
import ExportCaptionsToggle from "@/renderer/components/ExportCaptionsToggle";
import { Input } from "@/renderer/components/ui/input";
import { Label } from "@/renderer/components/ui/label";
import { Textarea } from "@/renderer/components/ui/textarea";
import { useAppStore } from "@/renderer/store/useAppStore";
import { toAppVideoUrl } from "@/lib/app-video-url";
import type { Clip, Project } from "@/types/electron";

interface EditorPanelProps {
  clip: Clip;
  project: Project;
  onClose: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

export default function EditorPanel({ clip, project, onClose }: EditorPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const updateClip = useAppStore((state) => state.updateClip);
  const startExport = useAppStore((state) => state.startExport);

  // Video metadata states
  const [videoWidth, setVideoWidth] = useState(project.width ?? 0);
  const [videoHeight, setVideoHeight] = useState(project.height ?? 0);

  // Clip parameter states
  const [title, setTitle] = useState(clip.title ?? "");
  const [description, setDescription] = useState(clip.description ?? "");
  const [startMs, setStartMs] = useState(clip.start_ms ?? 0);
  const [endMs, setEndMs] = useState(clip.end_ms ?? 0);
  const [cropX, setCropX] = useState(clip.crop_x ?? -1);

  // Playback states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startMs / 1000);

  const projectDuration = project.duration_sec ?? 0;

  // Calculate 9:16 crop width
  const cropW = videoHeight > 0 ? Math.round(videoHeight * (9 / 16)) : 0;
  const maxCropX = videoWidth > 0 && cropW > 0 ? Math.max(0, videoWidth - cropW) : 0;

  // If cropX is -1 (default center crop), calculate the default value
  const activeCropX = cropX === -1 ? Math.max(0, Math.round((videoWidth - cropW) / 2)) : cropX;

  // Calculate visual overlay percentages
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

  // Sync video time when startMs or endMs changes manually
  const handleStartChange = (val: number) => {
    const clamped = Math.max(0, Math.min(val, endMs - 500)); // Min 0.5s duration
    setStartMs(clamped);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped / 1000;
    }
  };

  const handleEndChange = (val: number) => {
    const clamped = Math.min(Math.round(projectDuration * 1000), Math.max(val, startMs + 500));
    setEndMs(clamped);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped / 1000;
    }
  };

  function handleLoadedMetadata() {
    const v = videoRef.current;
    if (!v) return;
    if (v.videoWidth > 0) {
      setVideoWidth(v.videoWidth);
      setVideoHeight(v.videoHeight);
    }
    // Seek to clip start on load
    v.currentTime = startMs / 1000;
  }

  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);

    // Loop within the clip boundaries
    if (v.currentTime >= endMs / 1000) {
      v.currentTime = startMs / 1000;
      if (!isPlaying) {
        v.pause();
      }
    } else if (v.currentTime < startMs / 1000) {
      v.currentTime = startMs / 1000;
    }
  }

  function togglePlayPause() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }

  const handleSave = async () => {
    await updateClip(clip.id, {
      title,
      description,
      start_ms: startMs,
      end_ms: endMs,
      crop_x: cropX,
    });
  };

  const handleExport = async () => {
    // Save first
    await handleSave();
    // Add to export queue
    await startExport(clip.id);
    onClose();
  };

  const videoSrc = toAppVideoUrl(project.video_path);
  const clipDurationSec = Math.max(0, (endMs - startMs) / 1000);
  const currentElapsedSec = Math.max(0, currentTime - startMs / 1000);

  return (
    <div className="fixed right-0 top-0 z-40 flex h-screen w-96 flex-col border-l border-border bg-card shadow-2xl">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Film className="h-4 w-4 text-primary" />
          Edit Video Clip
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

      {/* Video Preview */}
      <div className="shrink-0 bg-black">
        <div className="relative overflow-hidden aspect-video">
          <video
            ref={videoRef}
            src={videoSrc}
            className="w-full h-full object-contain"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
          
          {/* Dynamic 9:16 Overlays */}
          {videoWidth > 0 && cropW < videoWidth && (
            <>
              {/* Left Overlay */}
              <div
                className="pointer-events-none absolute inset-y-0 left-0 bg-black/60 border-r border-dashed border-white/20"
                style={{ width: `${leftOverlayPct}%` }}
              />
              {/* Crop Box Indicator */}
              <div
                className="pointer-events-none absolute inset-y-0 border-2 border-primary"
                style={{
                  left: `${leftOverlayPct}%`,
                  width: `${cropWidthPct}%`,
                }}
              >
                <div className="absolute top-2 left-2 rounded bg-black/70 px-1 py-0.5 text-[10px] font-semibold text-primary flex items-center gap-1">
                  <Move className="h-3 w-3" /> 9:16 Crop
                </div>
              </div>
              {/* Right Overlay */}
              <div
                className="pointer-events-none absolute inset-y-0 right-0 bg-black/60 border-l border-dashed border-white/20"
                style={{ width: `${rightOverlayPct}%` }}
              />
            </>
          )}
        </div>

        {/* Video Player Controls */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-border">
          <button
            onClick={togglePlayPause}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <span className="font-mono text-xs tabular-nums text-white/70">
            {formatTime(currentElapsedSec)} / {formatTime(clipDurationSec)}
          </span>
        </div>
      </div>

      {/* Editor Controls Form */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 p-4">
          
          {/* Title & Description */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="clip-title">Title</Label>
              <Input
                id="clip-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give your clip a title"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="clip-description">Description</Label>
              <Textarea
                id="clip-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary of the clip"
                rows={2}
              />
            </div>
          </div>

          <hr className="border-border" />

          {/* Horizontal Crop Pan Control */}
          {maxCropX > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="crop-slider" className="flex items-center gap-1">
                  Crop Center Offset
                </Label>
                <span className="text-xs text-muted-foreground font-mono">
                  {cropX === -1 ? "Auto (Center)" : `${activeCropX}px`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="crop-slider"
                  type="range"
                  min="0"
                  max={maxCropX}
                  value={activeCropX}
                  onChange={(e) => setCropX(parseInt(e.target.value))}
                  className="w-full accent-primary h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer"
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>Left</span>
                <span>Center</span>
                <span>Right</span>
              </div>
              {cropX !== -1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCropX(-1)}
                  className="h-6 text-[10px] px-2 text-muted-foreground"
                >
                  Reset to Center
                </Button>
              )}
            </div>
          )}

          <hr className="border-border" />

          {/* Trim Timings */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Trim Segment
            </h3>

            {/* Start Time Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <Label htmlFor="start-slider">Start Time</Label>
                <span className="font-mono">{formatTime(startMs / 1000)}</span>
              </div>
              <input
                id="start-slider"
                type="range"
                min="0"
                max={Math.round(projectDuration * 1000)}
                value={startMs}
                onChange={(e) => handleStartChange(parseInt(e.target.value))}
                className="w-full accent-primary h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* End Time Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <Label htmlFor="end-slider">End Time</Label>
                <span className="font-mono">{formatTime(endMs / 1000)}</span>
              </div>
              <input
                id="end-slider"
                type="range"
                min="0"
                max={Math.round(projectDuration * 1000)}
                value={endMs}
                onChange={(e) => handleEndChange(parseInt(e.target.value))}
                className="w-full accent-primary h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Fine adjustment buttons */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground uppercase text-center font-semibold">Start Frame</span>
                <div className="flex justify-center gap-1">
                  <Button variant="outline" size="sm" className="h-7 px-2 font-mono text-[10px]" onClick={() => handleStartChange(startMs - 500)}>-0.5s</Button>
                  <Button variant="outline" size="sm" className="h-7 px-2 font-mono text-[10px]" onClick={() => handleStartChange(startMs - 100)}>-0.1s</Button>
                  <Button variant="outline" size="sm" className="h-7 px-2 font-mono text-[10px]" onClick={() => handleStartChange(startMs + 100)}>+0.1s</Button>
                  <Button variant="outline" size="sm" className="h-7 px-2 font-mono text-[10px]" onClick={() => handleStartChange(startMs + 500)}>+0.5s</Button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground uppercase text-center font-semibold">End Frame</span>
                <div className="flex justify-center gap-1">
                  <Button variant="outline" size="sm" className="h-7 px-2 font-mono text-[10px]" onClick={() => handleEndChange(endMs - 500)}>-0.5s</Button>
                  <Button variant="outline" size="sm" className="h-7 px-2 font-mono text-[10px]" onClick={() => handleEndChange(endMs - 100)}>-0.1s</Button>
                  <Button variant="outline" size="sm" className="h-7 px-2 font-mono text-[10px]" onClick={() => handleEndChange(endMs + 100)}>+0.1s</Button>
                  <Button variant="outline" size="sm" className="h-7 px-2 font-mono text-[10px]" onClick={() => handleEndChange(endMs + 500)}>+0.5s</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="shrink-0 border-t border-border p-4 bg-muted/40 space-y-2">
        <ExportCaptionsToggle />
        <Button onClick={handleSave} variant="outline" className="w-full flex items-center justify-center gap-1.5">
          <Save className="h-4 w-4" />
          Save Settings
        </Button>
        <Button onClick={handleExport} className="w-full flex items-center justify-center gap-1.5">
          <Film className="h-4 w-4" />
          Export vertical video
        </Button>
      </div>
    </div>
  );
}
