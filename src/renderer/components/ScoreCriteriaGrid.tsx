import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/renderer/components/ui/tooltip";
import { SCORE_CRITERIA } from "@/renderer/lib/score-criteria";
import { cn } from "@/renderer/lib/utils";
import type { Clip } from "@/types/electron";

interface ScoreCriteriaGridProps {
  clip: Clip;
  variant?: "card" | "panel";
}

export default function ScoreCriteriaGrid({ clip, variant = "card" }: ScoreCriteriaGridProps) {
  return (
    <div className={cn("grid grid-cols-5 gap-1", variant === "panel" && "text-center")}>
      {SCORE_CRITERIA.map(({ key, label, description }) => {
        const value = (clip[key] as number | null) ?? 0;
        return (
          <Tooltip key={String(key)}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "cursor-help rounded-md px-1 py-1.5 text-center ring-1 ring-border/40",
                  variant === "card" ? "bg-secondary/60" : "bg-secondary/50"
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className={cn(
                    "tabular-nums text-foreground",
                    variant === "card" ? "text-xs font-bold" : "text-xs font-semibold"
                  )}
                >
                  {value.toFixed(0)}
                </div>
                <div
                  className={cn(
                    "leading-tight text-muted-foreground",
                    variant === "card" ? "text-[9px]" : "mt-0.5 text-[10px]"
                  )}
                >
                  {label}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[220px] px-3 py-2">
              <p className="font-semibold">{label}</p>
              <p className="mt-0.5 text-primary-foreground/90">{description}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
