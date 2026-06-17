import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import ClipCard from "@/renderer/components/ClipCard";
import { computeCompositeScore, sortByComposite } from "@/renderer/lib/scoring";
import { useAppStore } from "@/renderer/store/useAppStore";
import type { Clip } from "@/types/electron";

interface ClipGridProps {
  clips: Clip[];
}

/** Grid of AI-suggested clips, ranked by composite score. Shows an empty state when there are none. */
export default function ClipGrid({ clips }: ClipGridProps) {
  const selectedClipId = useAppStore((state) => state.selectedClipId);
  const setSelectedClipId = useAppStore((state) => state.setSelectedClipId);

  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  useEffect(() => {
    if (clips.length === 0) return;
    const load = async () => {
      const results = await Promise.allSettled(
        clips.map((c) =>
          window.electronAPI.invoke<string>("clip:getThumbnail", c.id)
        )
      );
      const map: Record<string, string> = {};
      results.forEach((r, i) => {
        map[clips[i].id] = r.status === "fulfilled" ? (r.value ?? "") : "";
      });
      setThumbnails(map);
    };
    void load();
  }, [clips]);

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

  const sortedClips = sortByComposite(clips);

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">
        Top Picks · {clips.length} clip{clips.length === 1 ? "" : "s"}
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sortedClips.map((clip) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            isSelected={selectedClipId === clip.id}
            onSelect={() => setSelectedClipId(clip.id)}
            compositeScore={computeCompositeScore(clip)}
            thumbnailB64={thumbnails[clip.id] ?? ""}
          />
        ))}
      </div>
    </div>
  );
}
