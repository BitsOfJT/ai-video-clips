import { useEffect, useState } from "react";
import { Wand2, AlertCircle } from "lucide-react";
import { Button } from "@/renderer/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/renderer/components/ui/card";
import { Progress } from "@/renderer/components/ui/progress";
import CreativeBriefInput from "@/renderer/components/CreativeBriefInput";
import VideoTypeSelector from "@/renderer/components/VideoTypeSelector";
import ClipGrid from "@/renderer/components/ClipGrid";
import PreviewPlayer from "@/renderer/components/PreviewPlayer";
import EditorPanel from "@/renderer/components/EditorPanel";
import ExportQueue from "@/renderer/components/ExportQueue";
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
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const isEditing = !!selectedClipId && isEditorOpen;

  useEffect(() => {
    void loadClips(projectId);
    void loadSettings();
  }, [projectId, loadClips, loadSettings]);

  const transcriptReady = project?.transcript_status === "completed";
  const isRunning = progress !== undefined;

  const providerLabel =
    settings?.provider === "gemini"
      ? settings.hasGeminiKey
        ? "Gemini"
        : "Gemini — no API key"
      : "Ollama";

  return (
    <Card className="surface-card overflow-hidden">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Wand2 className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">AI Clip Analysis</CardTitle>
              <CardDescription>
                Find the best short-form clips from your creative brief.
              </CardDescription>
            </div>
          </div>
          <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {providerLabel}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {!transcriptReady && (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            Complete transcription first — analysis needs the full transcript.
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <CreativeBriefInput value={brief} onChange={setBrief} disabled={isRunning} />
          <VideoTypeSelector value={videoType} onChange={setVideoType} disabled={isRunning} />
        </div>

        <Button
          onClick={() => startAnalysis({ projectId, creativeBrief: brief, videoType })}
          disabled={!transcriptReady || isRunning}
          className="w-full sm:w-auto sm:min-w-[200px]"
          size="lg"
        >
          {isRunning ? "Analyzing…" : clips.length > 0 ? "Re-run Analysis" : "Find Clips"}
        </Button>

        {isRunning && (
          <div className="space-y-2 rounded-lg bg-muted/30 p-4 ring-1 ring-border/60">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                {stage ? STAGE_LABEL[stage] : "Starting…"}
              </span>
              <span className="tabular-nums font-medium">{progress ?? 0}%</span>
            </div>
            <Progress value={progress ?? 0} className="h-2" />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive ring-1 ring-destructive/20">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <ClipGrid clips={clips} />

        <ExportQueue />

        {selectedClipId && project && (() => {
          const selectedClip = clips.find((c) => c.id === selectedClipId);
          return selectedClip ? (
            isEditing ? (
              <EditorPanel
                clip={selectedClip}
                project={project}
                onClose={() => setIsEditorOpen(false)}
              />
            ) : (
              <PreviewPlayer
                clip={selectedClip}
                project={project}
                onClose={() => setSelectedClipId(null)}
                onEdit={() => setIsEditorOpen(true)}
              />
            )
          ) : null;
        })()}
      </CardContent>
    </Card>
  );
}
