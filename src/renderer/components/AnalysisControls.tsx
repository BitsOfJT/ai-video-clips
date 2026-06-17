import { useEffect, useState } from "react";
import { Wand2, AlertCircle } from "lucide-react";
import { Button } from "@/renderer/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/renderer/components/ui/card";
import CreativeBriefInput from "@/renderer/components/CreativeBriefInput";
import VideoTypeSelector from "@/renderer/components/VideoTypeSelector";
import ClipGrid from "@/renderer/components/ClipGrid";
import PreviewPlayer from "@/renderer/components/PreviewPlayer";
import { useAppStore } from "@/renderer/store/useAppStore";
import type { AnalysisStatus, VideoType } from "@/types/electron";

interface AnalysisControlsProps {
  projectId: string;
}

const STAGE_LABEL: Record<AnalysisStatus, string> = {
  idle: "Idle",
  chunking: "Splitting transcript into clips…",
  scoring: "Scoring clips with AI…",
  refining: "Analyzing keyframes…",
  completed: "Done",
  failed: "Failed",
};

/**
 * Creative-brief + video-type + run controls for AI clip analysis. Mirrors
 * TranscriptionControls: gated on a completed transcript, streams progress, and
 * renders the resulting clip grid.
 */
export default function AnalysisControls({ projectId }: AnalysisControlsProps) {
  const project = useAppStore((state) => state.projects.find((p) => p.id === projectId));
  const startAnalysis = useAppStore((state) => state.startAnalysis);
  const loadClips = useAppStore((state) => state.loadClips);
  const loadSettings = useAppStore((state) => state.loadSettings);
  const settings = useAppStore((state) => state.settings);
  const progress = useAppStore((state) => state.analysisProgress[projectId]);
  const stage = useAppStore((state) => state.analysisStage[projectId]);
  const error = useAppStore((state) => state.analysisError[projectId]);
  const clips = useAppStore((state) => state.clips[projectId]) ?? [];
  const selectedClipId = useAppStore((state) => state.selectedClipId);
  const setSelectedClipId = useAppStore((state) => state.setSelectedClipId);

  const [brief, setBrief] = useState(project?.creative_brief ?? "");
  const [videoType, setVideoType] = useState<VideoType>(project?.video_type ?? "podcast");

  // Load persisted clips and current settings when the project changes.
  useEffect(() => {
    void loadClips(projectId);
    void loadSettings();
  }, [projectId, loadClips, loadSettings]);

  const transcriptReady = project?.transcript_status === "completed";
  const isRunning = progress !== undefined;

  const providerLabel =
    settings?.provider === "gemini"
      ? settings.hasGeminiKey
        ? "Gemini (cloud)"
        : "Gemini — no API key set"
      : "Ollama (local)";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="h-5 w-5" />
          AI Clip Analysis
        </CardTitle>
        <CardDescription>
          Find the best short-form clips based on your creative brief. Provider: {providerLabel}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!transcriptReady && (
          <p className="text-sm text-muted-foreground">
            Transcribe the video first — analysis needs the transcript.
          </p>
        )}

        <CreativeBriefInput value={brief} onChange={setBrief} disabled={isRunning} />
        <VideoTypeSelector value={videoType} onChange={setVideoType} disabled={isRunning} />

        <Button
          onClick={() => startAnalysis({ projectId, creativeBrief: brief, videoType })}
          disabled={!transcriptReady || isRunning}
          className="w-full"
        >
          {isRunning ? "Analyzing…" : clips.length > 0 ? "Re-run Analysis" : "Find Clips"}
        </Button>

        {isRunning && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{stage ? STAGE_LABEL[stage] : "Starting…"}</span>
              <span>{progress ?? 0}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-secondary">
              <div
                className="h-2 rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progress ?? 0}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <ClipGrid clips={clips} />

        {selectedClipId && project && (() => {
          const selectedClip = clips.find((c) => c.id === selectedClipId);
          return selectedClip ? (
            <PreviewPlayer
              clip={selectedClip}
              project={project}
              onClose={() => setSelectedClipId(null)}
            />
          ) : null;
        })()}
      </CardContent>
    </Card>
  );
}
