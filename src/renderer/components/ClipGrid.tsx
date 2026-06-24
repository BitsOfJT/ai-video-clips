import { useEffect, useState } from "react";
import { Sparkles, Trophy } from "lucide-react";
import ClipCard from "@/renderer/components/ClipCard";
import { computeCompositeScore, sortByComposite } from "@/renderer/lib/scoring";
import { useAppStore } from "@/renderer/store/useAppStore";
import type { Clip } from "@/types/electron";

interface ClipGridProps {
  clips: Clip[];
}

export default function ClipGrid({ clips }: ClipGridProps) {
  const selectedClipId = useAppStore((state) => state.selectedClipId);
  const setSelectedClipId = useAppStore((state) => state.setSelectedClipId);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  useEffect(() => {
    if (clips.length === 0) return;
    const load = async () => {
      const results = await Promise.allSettled(
        clips.map((c) => window.electronAPI.invoke<string>("clip:getThumbnail", c.id))
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
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/80 bg-muted/15 px-6 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <div>
          <p className="font-medium text-foreground">No clips yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter a creative brief and run analysis to generate ranked suggestions.
          </p>
        </div>
      </div>
    );
  }

  const sortedClips = sortByComposite(clips);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">
          Top Picks
          <span className="ml-2 font-normal text-muted-foreground">
            {clips.length} clip{clips.length === 1 ? "" : "s"} ranked by score
          </span>
        </h3>
      </div>
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
