import { useState } from "react";
import { Mic, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/renderer/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/renderer/components/ui/card";
import { Progress } from "@/renderer/components/ui/progress";
import { useAppStore } from "@/renderer/store/useAppStore";
import { cn } from "@/renderer/lib/utils";

interface TranscriptionControlsProps {
  projectId: string;
}

export default function TranscriptionControls({ projectId }: TranscriptionControlsProps) {
  const [extractAudio, setExtractAudio] = useState(false);
  const startTranscription = useAppStore((state) => state.startTranscription);
  const transcriptionProgress = useAppStore((state) => state.transcriptionProgress[projectId]);
  const transcriptionError = useAppStore((state) => state.transcriptionError[projectId]);
  const currentProject = useAppStore((state) =>
    state.projects.find((p) => p.id === projectId)
  );

  const isActive = transcriptionProgress !== undefined && transcriptionProgress < 100;
  const status = currentProject?.transcript_status ?? "idle";
  const isCompleted = status === "completed";

  return (
    <Card className="surface-card overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg",
              isCompleted ? "bg-emerald-500/15 text-emerald-400" : "bg-primary/15 text-primary"
            )}
          >
            {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </div>
          <div>
            <CardTitle className="text-base">Transcription</CardTitle>
            <CardDescription>Extract word-level timestamps from the video.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isCompleted ? (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-400 ring-1 ring-emerald-500/20">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Transcription complete — ready for AI analysis.
          </div>
        ) : (
          <>
            <label
              htmlFor={`extract-audio-${projectId}`}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/80 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
            >
              <input
                type="checkbox"
                id={`extract-audio-${projectId}`}
                checked={extractAudio}
                onChange={(e) => setExtractAudio(e.target.checked)}
                className="mt-0.5 rounded border-border"
              />
              <div className="text-left">
                <div className="text-sm font-medium">Extract audio with FFmpeg first</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {extractAudio
                    ? "Slower but more reliable for unusual codecs."
                    : "Fastest — transcribes the video file directly."}
                </p>
              </div>
            </label>

            <Button
              onClick={() => startTranscription(projectId, extractAudio)}
              disabled={isActive || isCompleted}
              className="w-full"
            >
              {isActive ? "Transcribing…" : "Start Transcription"}
            </Button>

            {isActive && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Processing</span>
                  <span className="tabular-nums font-medium text-foreground">
                    {transcriptionProgress}%
                  </span>
                </div>
                <Progress value={transcriptionProgress} className="h-2" />
              </div>
            )}

            {transcriptionError && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive ring-1 ring-destructive/20">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {transcriptionError}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
