import { useMemo } from "react";
import { ScrollArea } from "@/renderer/components/ui/scroll-area";
import { useAppStore } from "@/renderer/store/useAppStore";
import type { TranscriptSegment } from "@/types/electron";

interface TranscriptViewerProps {
  projectId: string;
}

/**
 * Renders the selected project's transcript as a scrollable list of segments.
 * Each word displays its timestamp on hover, providing a foundation for future
 * video-seeking features.
 */
export default function TranscriptViewer({ projectId }: TranscriptViewerProps) {
  const currentProject = useAppStore((state) =>
    state.projects.find((p) => p.id === projectId)
  );

  const transcriptJson = currentProject?.transcript_json ?? null;

  // Parse the stored transcript JSON into typed segments on demand.
  const segments = useMemo<TranscriptSegment[]>(() => {
    if (!transcriptJson) return [];
    try {
      const parsed = JSON.parse(transcriptJson) as { segments: TranscriptSegment[] };
      return parsed.segments ?? [];
    } catch {
      return [];
    }
  }, [transcriptJson]);

  // Empty state before a transcript exists for the project.
  if (!currentProject?.transcript_json) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Transcript not available yet. Start transcription to view.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-4 text-sm font-semibold">Transcript</h3>
      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-4">
          {segments.map((segment) => (
            <div key={segment.id} className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatTime(segment.start)}</span>
                <span>→</span>
                <span>{formatTime(segment.end)}</span>
              </div>
              <p className="text-sm leading-relaxed">
                {segment.words.map((word, idx) => (
                  <span
                    key={`${word.start}-${word.word}-${idx}`}
                    className="inline-block cursor-default rounded px-0.5 hover:bg-accent hover:text-accent-foreground"
                    title={`${formatTime(word.start)} – ${formatTime(word.end)}`}
                  >
                    {word.word}
                  </span>
                ))}
              </p>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * Formats a floating-point second value into MM:SS.mmm display.
 * Used consistently for segment and word timestamps.
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}
