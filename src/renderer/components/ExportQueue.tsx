import { useState } from "react";
import { Play, CheckCircle2, AlertCircle, Loader2, FolderOpen, Trash2, X } from "lucide-react";
import { Button } from "@/renderer/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/renderer/components/ui/card";
import { useAppStore } from "@/renderer/store/useAppStore";
import { IPC_CHANNELS } from "@/constants";

export default function ExportQueue() {
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const clips = useAppStore((state) => (currentProjectId ? state.clips[currentProjectId] : [])) || [];
  const exportProgress = useAppStore((state) => state.exportProgress);
  const exportStatus = useAppStore((state) => state.exportStatus);
  const exportError = useAppStore((state) => state.exportError);
  const exportOutputPaths = useAppStore((state) => state.exportOutputPaths);
  const cancelExport = useAppStore((state) => state.cancelExport);
  const [revealError, setRevealError] = useState<string | null>(null);

  const projectClipIds = new Set(clips.map((c) => c.id));
  const activeAndCompletedClipIds = Object.keys(exportStatus).filter(
    (id) => exportStatus[id] !== "idle" && projectClipIds.has(id)
  );

  const handleOpenFolder = async (filePath: string) => {
    setRevealError(null);
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.SHELL_SHOW_ITEM, filePath);
    } catch {
      setRevealError("Could not open file. It may have been moved or deleted.");
    }
  };

  if (activeAndCompletedClipIds.length === 0) {
    return null;
  }

  return (
    <Card className="border border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          <Play className="h-5 w-5 text-primary fill-primary/10" />
          Export Queue
        </CardTitle>
        <CardDescription>
          Track your vertical video exports. They render sequentially in the background.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {revealError && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {revealError}
          </p>
        )}
        <div className="divide-y divide-border rounded-md border border-border bg-muted/20">
          {activeAndCompletedClipIds.map((clipId) => {
            const clip = clips.find((c) => c.id === clipId);
            const status = exportStatus[clipId];
            const percent = exportProgress[clipId] ?? 0;
            const error = exportError[clipId];
            const outputPath = exportOutputPaths[clipId] ?? clip?.output_path ?? null;
            const title = clip?.title || `Clip (${clipId.slice(0, 6)})`;

            return (
              <div key={clipId} className="flex flex-col p-4 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-semibold text-foreground">
                      {title}
                    </h4>
                    {outputPath && (
                      <p className="truncate text-xs text-muted-foreground mt-0.5" title={outputPath}>
                        Path: {outputPath}
                      </p>
                    )}
                    {error && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {error}
                      </p>
                    )}
                  </div>
                  
                  {/* Action controls */}
                  <div className="flex items-center gap-1 shrink-0">
                    {status === "completed" && outputPath && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-primary hover:text-primary-foreground hover:bg-primary/20"
                        onClick={() => handleOpenFolder(outputPath)}
                        title="Reveal in Finder / Explorer"
                      >
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                    )}

                    {(status === "queued" || status === "rendering") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => cancelExport(clipId)}
                        title="Cancel Export"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}

                    {(status === "completed" || status === "failed") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          // Clean up status to hide from queue view
                          useAppStore.setState((state) => {
                            const nextStatus = { ...state.exportStatus };
                            delete nextStatus[clipId];
                            const nextProgress = { ...state.exportProgress };
                            delete nextProgress[clipId];
                            const nextError = { ...state.exportError };
                            delete nextError[clipId];
                            return {
                              exportStatus: nextStatus,
                              exportProgress: nextProgress,
                              exportError: nextError,
                            };
                          });
                        }}
                        title="Dismiss"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="flex items-center gap-3">
                  <div className="min-w-[70px] shrink-0 text-xs font-semibold uppercase flex items-center gap-1.5">
                    {status === "queued" && (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        <span className="text-muted-foreground">Queued</span>
                      </>
                    )}
                    {status === "rendering" && (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        <span className="text-primary font-mono tabular-nums">{percent}%</span>
                      </>
                    )}
                    {status === "completed" && (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 fill-emerald-500/10" />
                        <span className="text-emerald-500">Done</span>
                      </>
                    )}
                    {status === "failed" && (
                      <>
                        <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                        <span className="text-destructive">Failed</span>
                      </>
                    )}
                  </div>

                  {(status === "rendering" || status === "queued") && (
                    <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
