import { Clock, Film, Play } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/renderer/components/ui/card";
import { cn } from "@/renderer/lib/utils";
import { formatDuration } from "@/renderer/lib/utils";
import type { Clip } from "@/types/electron";

interface ClipCardProps {
  clip: Clip;
  onSelect: () => void;
  isSelected: boolean;
  compositeScore: number;
  thumbnailB64: string;
}

function scoreColor(score: number): string {
  if (score >= 8) return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  if (score >= 6) return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  return "bg-muted/80 text-muted-foreground border-border";
}

const CRITERIA: Array<{ key: keyof Clip; label: string }> = [
  { key: "hook_strength", label: "Hook" },
  { key: "brief_relevance", label: "Brief" },
  { key: "self_containment", label: "Standalone" },
  { key: "emotional_arc", label: "Emotion" },
  { key: "platform_fit", label: "Platform" },
];

export default function ClipCard({
  clip,
  onSelect,
  isSelected,
  compositeScore,
  thumbnailB64,
}: ClipCardProps) {
  const startSec = (clip.start_ms ?? 0) / 1000;
  const endSec = (clip.end_ms ?? 0) / 1000;
  const lengthSec = Math.max(0, endSec - startSec);

  return (
    <Card
      className={cn(
        "group flex cursor-pointer flex-col overflow-hidden border-border/80 transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
        isSelected && "border-primary/50 ring-2 ring-primary/40 shadow-lg shadow-primary/10"
      )}
      onClick={onSelect}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {thumbnailB64 ? (
          <img
            src={`data:image/jpeg;base64,${thumbnailB64}`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            alt=""
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <Film className="h-8 w-8 text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-lg">
            <Play className="h-4 w-4 fill-current pl-0.5" />
          </div>
        </div>
        <span
          className={cn(
            "absolute right-2 top-2 rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums backdrop-blur-sm",
            scoreColor(compositeScore)
          )}
        >
          {compositeScore.toFixed(1)}
        </span>
      </div>
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="line-clamp-2 text-sm font-semibold leading-snug">
          {clip.title || "Untitled clip"}
        </CardTitle>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatDuration(startSec)} – {formatDuration(endSec)} · {Math.round(lengthSec)}s
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 pb-4">
        {clip.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {clip.description}
          </p>
        )}
        <div className="mt-auto grid grid-cols-5 gap-1">
          {CRITERIA.map(({ key, label }) => {
            const v = (clip[key] as number | null) ?? 0;
            return (
              <div
                key={String(key)}
                className="rounded-md bg-secondary/60 px-1 py-1.5 text-center ring-1 ring-border/40"
              >
                <div className="text-xs font-bold tabular-nums text-foreground">{v.toFixed(0)}</div>
                <div className="text-[9px] leading-tight text-muted-foreground">{label}</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
