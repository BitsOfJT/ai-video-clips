import { useEffect, useMemo, useState } from "react";
import { Download, Sparkles, Trophy } from "lucide-react";
import ExportCaptionsToggle from "@/renderer/components/ExportCaptionsToggle";
import ClipCard from "@/renderer/components/ClipCard";
import { Button } from "@/renderer/components/ui/button";
import { computeCompositeScore, sortByComposite } from "@/renderer/lib/scoring";
import { useAppStore } from "@/renderer/store/useAppStore";
import type { Clip } from "@/types/electron";

interface ClipGridProps {
  clips: Clip[];
  projectId: string;
}

export default function ClipGrid({ clips, projectId }: ClipGridProps) {
  const selectedClipId = useAppStore((state) => state.selectedClipId);
  const setSelectedClipId = useAppStore((state) => state.setSelectedClipId);
  const startExport = useAppStore((state) => state.startExport);
  const startExportBatch = useAppStore((state) => state.startExportBatch);
  const exportStatus = useAppStore((state) => state.exportStatus);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [exportSelection, setExportSelection] = useState<Set<string>>(new Set());

  const sortedClips = useMemo(() => sortByComposite(clips), [clips]);
  const validClipIds = useMemo(() => new Set(clips.map((c) => c.id)), [clips]);
  const selectedForExport = useMemo(
    () => new Set([...exportSelection].filter((id) => validClipIds.has(id))),
    [exportSelection, validClipIds]
  );

  const batchExportBusy = sortedClips.some((clip) => {
    const status = exportStatus[clip.id];
    return status === "queued" || status === "rendering";
  });

  const selectedExportCount = selectedForExport.size;

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

  const toggleExportSelect = (clipId: string) => {
    setExportSelection((prev) => {
      const next = new Set(prev);
      if (next.has(clipId)) {
        next.delete(clipId);
      } else {
        next.add(clipId);
      }
      return next;
    });
  };

  const selectAllForExport = () => {
    setExportSelection(new Set(sortedClips.map((c) => c.id)));
  };

  const clearExportSelection = () => {
    setExportSelection(new Set());
  };

  if (clips.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/80 bg-muted/15 px-6 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <div>
          <p className="font-medium text-foreground">No clips yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Describe what clips you want, then run analysis to generate ranked suggestions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">
            Top Picks
            <span className="ml-2 font-normal text-muted-foreground">
              {clips.length} clip{clips.length === 1 ? "" : "s"} ranked by score
            </span>
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ExportCaptionsToggle />
          <Button variant="ghost" size="sm" onClick={selectAllForExport}>
            Select all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={selectedExportCount === 0}
            onClick={clearExportSelection}
          >
            Clear
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={selectedExportCount === 0 || batchExportBusy}
            onClick={() => void startExportBatch(projectId, [...selectedForExport])}
          >
            <Download className="h-3.5 w-3.5" />
            Export selected{selectedExportCount > 0 ? ` (${selectedExportCount})` : ""}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sortedClips.map((clip) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            isSelected={selectedClipId === clip.id}
            isExportSelected={selectedForExport.has(clip.id)}
            onSelect={() => setSelectedClipId(clip.id)}
            onToggleExportSelect={() => toggleExportSelect(clip.id)}
            onExport={() => void startExport(clip.id)}
            compositeScore={computeCompositeScore(clip)}
            thumbnailB64={thumbnails[clip.id] ?? ""}
          />
        ))}
      </div>
    </div>
  );
}
