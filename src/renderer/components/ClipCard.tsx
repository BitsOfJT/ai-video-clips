import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/renderer/components/ui/card";
import { cn } from "@/renderer/lib/utils";
import { formatDuration } from "@/renderer/lib/utils";
import type { Clip } from "@/types/electron";

interface ClipCardProps {
  clip: Clip;
}

/** Color the score badge by tier so strong picks stand out at a glance. */
function scoreColor(score: number): string {
  if (score >= 8) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (score >= 6) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
}

const CRITERIA: Array<{ key: keyof Clip; label: string }> = [
  { key: "hook_strength", label: "Hook" },
  { key: "brief_relevance", label: "Brief" },
  { key: "self_containment", label: "Standalone" },
  { key: "emotional_arc", label: "Emotion" },
  { key: "platform_fit", label: "Platform" },
];

/** A single AI-suggested clip: title, score badge, time range, description, and score breakdown. */
export default function ClipCard({ clip }: ClipCardProps) {
  const score = clip.ai_score ?? 0;
  const startSec = (clip.start_ms ?? 0) / 1000;
  const endSec = (clip.end_ms ?? 0) / 1000;
  const lengthSec = Math.max(0, endSec - startSec);

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">{clip.title || "Untitled clip"}</CardTitle>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
              scoreColor(score)
            )}
          >
            {score.toFixed(1)}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatDuration(startSec)} – {formatDuration(endSec)} · {Math.round(lengthSec)}s
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {clip.description && <p className="text-sm text-muted-foreground">{clip.description}</p>}
        <div className="mt-auto grid grid-cols-5 gap-1 text-center">
          {CRITERIA.map(({ key, label }) => {
            const v = (clip[key] as number | null) ?? 0;
            return (
              <div key={String(key)} className="rounded bg-secondary/50 px-1 py-1">
                <div className="text-xs font-semibold tabular-nums">{v.toFixed(0)}</div>
                <div className="text-[10px] leading-tight text-muted-foreground">{label}</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
