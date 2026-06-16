import ImportZone from "@/renderer/components/ImportZone";
import TranscriptionControls from "@/renderer/components/TranscriptionControls";
import TranscriptViewer from "@/renderer/components/TranscriptViewer";
import AnalysisControls from "@/renderer/components/AnalysisControls";
import { Card, CardContent, CardHeader, CardTitle } from "@/renderer/components/ui/card";
import { useAppStore } from "@/renderer/store/useAppStore";
import { formatDuration } from "@/renderer/lib/utils";

/**
 * Home page: project grid, import zone, and the transcription workflow
 * for the currently selected project.
 */
export default function HomePage() {
  const projects = useAppStore((state) => state.projects);
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const setCurrentProjectId = useAppStore((state) => state.setCurrentProjectId);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
        <p className="text-muted-foreground">
          Import a video to start generating clips.
        </p>
      </div>

      <ImportZone />

      {projects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card
              key={project.id}
              className={`cursor-pointer transition-colors hover:border-primary ${
                currentProjectId === project.id ? "border-primary" : ""
              }`}
              onClick={() => setCurrentProjectId(project.id)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="truncate text-base">
                  {project.title || "Untitled Project"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  {project.duration_sec
                    ? `Duration: ${formatDuration(project.duration_sec)}`
                    : "Duration: unknown"}
                </div>
                {project.width && project.height && (
                  <div className="text-sm text-muted-foreground">
                    Resolution: {project.width}x{project.height}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {currentProjectId && (
        <div className="space-y-6">
          <TranscriptionControls projectId={currentProjectId} />
          <TranscriptViewer projectId={currentProjectId} />
          <AnalysisControls projectId={currentProjectId} />
        </div>
      )}
    </div>
  );
}
