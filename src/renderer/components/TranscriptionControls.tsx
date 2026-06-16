import { useState } from "react";
import { Mic, AlertCircle } from "lucide-react";
import { Button } from "@/renderer/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/renderer/components/ui/card";
import { useAppStore } from "@/renderer/store/useAppStore";

interface TranscriptionControlsProps {
  projectId: string;
}

/**
 * Allows the user to configure and trigger transcription for the selected project.
 * Shows an audio-extraction toggle, start button, progress bar, and any error message.
 */
export default function TranscriptionControls({ projectId }: TranscriptionControlsProps) {
  // Whether to extract a clean audio track before transcription.
  const [extractAudio, setExtractAudio] = useState(false);
  const startTranscription = useAppStore((state) => state.startTranscription);
  const transcriptionProgress = useAppStore((state) => state.transcriptionProgress[projectId]);
  const transcriptionError = useAppStore((state) => state.transcriptionError[projectId]);
  const isActive = transcriptionProgress !== undefined && transcriptionProgress < 100;

  // Find the project so we can reflect its persisted transcript_status.
  const currentProject = useAppStore((state) =>
    state.projects.find((p) => p.id === projectId)
  );
  const status = currentProject?.transcript_status ?? "idle";
  const isCompleted = status === "completed";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="h-5 w-5" />
          Transcription
        </CardTitle>
        <CardDescription>
          Extract word-level timestamps from the video.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isCompleted ? (
          <p className="text-sm text-muted-foreground">Transcription complete.</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`extract-audio-${projectId}`}
                checked={extractAudio}
                onChange={(e) => setExtractAudio(e.target.checked)}
                className="rounded border-border bg-background"
              />
              <label htmlFor={`extract-audio-${projectId}`} className="text-sm">
                Extract audio first with FFmpeg (most reliable)
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              {!extractAudio
                ? "Transcribe video directly (fastest)"
                : "Extracts a clean 16 kHz WAV before transcribing. Slightly slower but more reliable for unusual codecs."}
            </p>

            <Button
              onClick={() => startTranscription(projectId, extractAudio)}
              disabled={isActive || isCompleted}
              className="w-full"
            >
              {isActive ? "Transcribing..." : isCompleted ? "Transcribed" : "Start Transcription"}
            </Button>

            {isActive && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span>{transcriptionProgress}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary">
                  <div
                    className="h-2 rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${transcriptionProgress}%` }}
                  />
                </div>
              </div>
            )}

            {transcriptionError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {transcriptionError}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
