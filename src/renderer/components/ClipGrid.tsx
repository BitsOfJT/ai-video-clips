import { Sparkles } from "lucide-react";
import ClipCard from "@/renderer/components/ClipCard";
import type { Clip } from "@/types/electron";

interface ClipGridProps {
  clips: Clip[];
}

/** Grid of AI-suggested clips, ranked by score. Shows an empty state when there are none. */
export default function ClipGrid({ clips }: ClipGridProps) {
  if (clips.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center">
        <Sparkles className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No clips yet. Run analysis to generate suggestions.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">
        Top Picks · {clips.length} clip{clips.length === 1 ? "" : "s"}
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {clips.map((clip) => (
          <ClipCard key={clip.id} clip={clip} />
        ))}
      </div>
    </div>
  );
}
