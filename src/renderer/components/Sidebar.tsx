import { useEffect, useState } from "react";
import { Clapperboard, Film, Plus, Settings, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/renderer/lib/utils";
import { Button } from "@/renderer/components/ui/button";
import { ProjectStatusDot } from "@/renderer/components/WorkflowStepper";
import { useAppStore } from "@/renderer/store/useAppStore";
import { APP_VERSION } from "@/constants";
import { formatDuration } from "@/renderer/lib/utils";

export default function Sidebar() {
  const projects = useAppStore((state) => state.projects);
  const clips = useAppStore((state) => state.clips);
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const setCurrentProjectId = useAppStore((state) => state.setCurrentProjectId);
  const loadProjects = useAppStore((state) => state.loadProjects);
  const deleteProject = useAppStore((state) => state.deleteProject);
  const checkSystemHealth = useAppStore((state) => state.checkSystemHealth);
  const systemHealth = useAppStore((state) => state.systemHealth);
  const view = useAppStore((state) => state.view);
  const setView = useAppStore((state) => state.setView);

  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
    void checkSystemHealth();
  }, [loadProjects, checkSystemHealth]);

  const selectProject = (id: string) => {
    setCurrentProjectId(id);
    if (view !== "longform") {
      setView("home");
    }
  };

  const scrollToImport = () => {
    setView("home");
    requestAnimationFrame(() => {
      document.getElementById("import-zone")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const handleDeleteProject = async (
    e: React.MouseEvent,
    projectId: string,
    title: string
  ) => {
    e.stopPropagation();
    setDeleteError(null);

    const confirmed = window.confirm(
      `Delete "${title || "Untitled Project"}"? Clips and analysis data will be removed. The original video file on disk is not deleted.`
    );
    if (!confirmed) return;

    try {
      await deleteProject(projectId);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete project");
    }
  };

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-border/80 bg-card/60 backdrop-blur-md">
      <div className="border-b border-border/80 px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25">
            <Clapperboard className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold tracking-tight">AI Video Clipper</div>
            <div className="text-[10px] font-medium text-muted-foreground">v{APP_VERSION}</div>
          </div>
        </div>
      </div>

      <div className="space-y-1 border-b border-border/80 p-3">
        <button
          type="button"
          onClick={() => setView("home")}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-sm transition-colors hover:bg-accent/60",
            view === "home" && "bg-accent/80 text-foreground ring-1 ring-primary/25"
          )}
        >
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          Shorts Clipper
        </button>
        <button
          type="button"
          onClick={() => setView("longform")}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-sm transition-colors hover:bg-accent/60",
            view === "longform" && "bg-accent/80 text-foreground ring-1 ring-primary/25"
          )}
        >
          <Film className="h-4 w-4 text-muted-foreground" />
          Long-Form Editor
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Projects
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-primary"
            onClick={scrollToImport}
            title="Import new video"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {deleteError && (
          <p className="mb-2 px-1 text-xs text-destructive">{deleteError}</p>
        )}

        <div className="space-y-0.5">
          {projects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-6 text-center">
              <Sparkles className="mx-auto mb-2 h-5 w-5 text-muted-foreground/60" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                No projects yet.
                <br />
                Drop a video to begin.
              </p>
            </div>
          ) : (
            projects.map((project) => {
              const isActive = currentProjectId === project.id;
              const projectClips = clips[project.id] ?? [];
              const hasClips =
                projectClips.length > 0 || project.analysis_status === "completed";
              return (
                <div
                  key={project.id}
                  className={cn(
                    "group flex items-start gap-1 rounded-lg transition-all",
                    isActive &&
                      "bg-accent/80 ring-1 ring-primary/30 shadow-[inset_3px_0_0_0_hsl(var(--primary))]"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => selectProject(project.id)}
                    className="min-w-0 flex-1 rounded-lg px-2.5 py-2.5 text-left text-sm hover:bg-accent/60"
                  >
                    <div className="flex items-center gap-2">
                      <ProjectStatusDot project={project} hasClips={hasClips} />
                      <div className="min-w-0 flex-1 truncate font-medium">
                        {project.title || "Untitled Project"}
                      </div>
                    </div>
                    <div className="mt-1 truncate pl-4 text-[11px] text-muted-foreground">
                      {project.duration_sec
                        ? formatDuration(project.duration_sec)
                        : "Unknown duration"}
                      {project.width && project.height
                        ? ` · ${project.width}×${project.height}`
                        : null}
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-1.5 h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 group-focus-within:opacity-100"
                    onClick={(e) =>
                      void handleDeleteProject(e, project.id, project.title ?? "")
                    }
                    title="Delete project"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="space-y-1 border-t border-border/80 p-3">
        {systemHealth && !systemHealth.ready && (
          <button
            onClick={() => setView("home")}
            className="mb-1 flex w-full items-center gap-2 rounded-lg bg-amber-500/10 px-2.5 py-2 text-left text-xs text-amber-400 ring-1 ring-amber-500/20"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
            Setup incomplete
          </button>
        )}
        <button
          onClick={() => setView("settings")}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-sm transition-colors hover:bg-accent/60",
            view === "settings" && "bg-accent/80 text-foreground"
          )}
        >
          <Settings className="h-4 w-4 text-muted-foreground" />
          Settings
        </button>
      </div>
    </aside>
  );
}
