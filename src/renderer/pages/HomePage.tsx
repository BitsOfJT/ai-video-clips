import ImportZone from "@/renderer/components/ImportZone";
import TranscriptionControls from "@/renderer/components/TranscriptionControls";
import TranscriptViewer from "@/renderer/components/TranscriptViewer";
import AnalysisControls from "@/renderer/components/AnalysisControls";
import WorkflowStepper from "@/renderer/components/WorkflowStepper";
import { useAppStore } from "@/renderer/store/useAppStore";
import { formatDuration } from "@/renderer/lib/utils";
import { Film, Clock, Maximize2 } from "lucide-react";

export default function HomePage() {
  const projects = useAppStore((state) => state.projects);
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const clips = useAppStore((state) => state.clips);
  const exportStatus = useAppStore((state) => state.exportStatus);

  const project = projects.find((p) => p.id === currentProjectId);
  const projectClips = currentProjectId ? (clips[currentProjectId] ?? []) : [];
  const hasExported = projectClips.some(
    (clip) =>
      exportStatus[clip.id] === "completed" ||
      (clip.status === "completed" && !!clip.output_path)
  );

  return (
    <div className="space-y-8">
      {!project ? (
        <div className="space-y-8 pt-4">
          <div className="mx-auto max-w-xl text-center">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Turn long videos into{" "}
              <span className="bg-gradient-to-r from-primary to-violet-400 bg-clip-text text-transparent">
                viral clips
              </span>
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              Import a video, transcribe locally, and let AI find your best
              short-form moments — then export ready-to-post 9:16 clips.
            </p>
          </div>
          <ImportZone variant="hero" />
          {projects.length > 0 && (
            <p className="text-center text-sm text-muted-foreground">
              Or select a project from the sidebar to continue where you left off.
            </p>
          )}
        </div>
      ) : (
        <>
          <header className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                  Current project
                </p>
                <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
                  {project.title || "Untitled Project"}
                </h1>
              </div>
              <div className="flex flex-wrap gap-2">
                {project.duration_sec != null && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDuration(project.duration_sec)}
                  </span>
                )}
                {project.width && project.height && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                    <Maximize2 className="h-3.5 w-3.5" />
                    {project.width}×{project.height}
                  </span>
                )}
                {project.fps != null && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                    <Film className="h-3.5 w-3.5" />
                    {Math.round(project.fps)} fps
                  </span>
                )}
              </div>
            </div>

            <div className="surface-card rounded-xl p-4 sm:p-5">
              <WorkflowStepper
                project={project}
                hasClips={projectClips.length > 0}
                hasExported={hasExported}
              />
            </div>
          </header>

          <ImportZone variant="compact" />

          <div className="grid gap-6 lg:grid-cols-2">
            <TranscriptionControls projectId={project.id} />
            <div className="lg:col-span-2">
              <TranscriptViewer projectId={project.id} />
            </div>
          </div>

          <AnalysisControls key={project.id} projectId={project.id} />
        </>
      )}
    </div>
  );
}
