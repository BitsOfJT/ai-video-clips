import { Check, Clock, Download, Film, Play } from "lucide-react";
import { Button } from "@/renderer/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/renderer/components/ui/card";
import ScoreCriteriaGrid from "@/renderer/components/ScoreCriteriaGrid";
import { cn } from "@/renderer/lib/utils";
import { formatDuration } from "@/renderer/lib/utils";
import type { Clip } from "@/types/electron";

interface ClipCardProps {
  clip: Clip;
  onSelect: () => void;
  onExport?: () => void;
  isSelected: boolean;
  isExportSelected?: boolean;
  onToggleExportSelect?: () => void;
  compositeScore: number;
  thumbnailB64: string;
}

function scoreColor(score: number): string {
  if (score >= 8) return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  if (score >= 6) return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  return "bg-muted/80 text-muted-foreground border-border";
}

export default function ClipCard({
  clip,
  onSelect,
  onExport,
  isSelected,
  isExportSelected = false,
  onToggleExportSelect,
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
        {onToggleExportSelect && (
          <button
            type="button"
            aria-label={isExportSelected ? "Deselect for export" : "Select for export"}
            aria-pressed={isExportSelected}
            className={cn(
              "absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border shadow-sm transition-colors",
              isExportSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-white/40 bg-black/50 text-white opacity-0 group-hover:opacity-100 hover:bg-black/70"
            )}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExportSelect();
            }}
          >
            {isExportSelected && <Check className="h-3.5 w-3.5" />}
          </button>
        )}
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
        <div className="mt-auto">
          <ScoreCriteriaGrid clip={clip} variant="card" />
        </div>
        {onExport && (
          <Button
            variant="outline"
            size="sm"
            className="mt-1 w-full gap-1.5"
            onClick={(e) => {
              e.stopPropagation();
              onExport();
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Export MP4
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
