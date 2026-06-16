import { useEffect } from "react";
import { Film, Plus, Settings } from "lucide-react";
import { cn } from "@/renderer/lib/utils";
import { Button } from "@/renderer/components/ui/button";
import { useAppStore } from "@/renderer/store/useAppStore";

export default function Sidebar() {
  const projects = useAppStore((state) => state.projects);
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const setCurrentProjectId = useAppStore((state) => state.setCurrentProjectId);
  const loadProjects = useAppStore((state) => state.loadProjects);
  const view = useAppStore((state) => state.view);
  const setView = useAppStore((state) => state.setView);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const selectProject = (id: string) => {
    setCurrentProjectId(id);
    setView("home");
  };

  return (
    <aside className="flex h-full w-60 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border p-4">
        <Film className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold">AI Video Clipper</span>
      </div>

      <div className="flex-1 overflow-auto p-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Projects
          </h2>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-1">
          {projects.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No projects yet. Drop a video to get started.
            </p>
          ) : (
            projects.map((project) => (
              <button
                key={project.id}
                onClick={() => selectProject(project.id)}
                className={cn(
                  "w-full rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent",
                  view === "home" && currentProjectId === project.id && "bg-accent"
                )}
              >
                <div className="truncate font-medium">
                  {project.title || "Untitled Project"}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {project.duration_sec
                    ? `${Math.round(project.duration_sec)}s`
                    : "Unknown duration"}
                  {project.width && project.height
                    ? ` · ${project.width}x${project.height}`
                    : null}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="border-t border-border p-3">
        <button
          onClick={() => setView("settings")}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent",
            view === "settings" && "bg-accent"
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>
    </aside>
  );
}
