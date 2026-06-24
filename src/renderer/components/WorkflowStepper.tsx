import { Check, Circle, Upload, Mic, Wand2, Download } from "lucide-react";
import { cn } from "@/renderer/lib/utils";
import type { Project } from "@/types/electron";

type StepId = "import" | "transcribe" | "analyze" | "export";

interface Step {
  id: StepId;
  label: string;
  description: string;
  icon: typeof Upload;
}

const STEPS: Step[] = [
  { id: "import", label: "Import", description: "Add your video", icon: Upload },
  { id: "transcribe", label: "Transcribe", description: "Word-level timestamps", icon: Mic },
  { id: "analyze", label: "Analyze", description: "AI clip suggestions", icon: Wand2 },
  { id: "export", label: "Export", description: "9:16 vertical clips", icon: Download },
];

function getStepState(
  stepId: StepId,
  project: Project | undefined,
  hasClips: boolean,
  hasExported: boolean
): "complete" | "current" | "upcoming" {
  if (!project) {
    return stepId === "import" ? "current" : "upcoming";
  }

  const transcriptDone = project.transcript_status === "completed";
  const analysisDone = project.analysis_status === "completed" || hasClips;

  switch (stepId) {
    case "import":
      return "complete";
    case "transcribe":
      if (transcriptDone) return "complete";
      return "current";
    case "analyze":
      if (analysisDone) return "complete";
      if (transcriptDone) return "current";
      return "upcoming";
    case "export":
      if (hasExported) return "complete";
      if (analysisDone) return "current";
      return "upcoming";
    default:
      return "upcoming";
  }
}

interface WorkflowStepperProps {
  project?: Project;
  hasClips?: boolean;
  hasExported?: boolean;
  className?: string;
}

export default function WorkflowStepper({
  project,
  hasClips = false,
  hasExported = false,
  className,
}: WorkflowStepperProps) {
  return (
    <nav aria-label="Workflow progress" className={cn("w-full", className)}>
      <ol className="flex items-center gap-1 sm:gap-2">
        {STEPS.map((step, index) => {
          const state = getStepState(step.id, project, hasClips, hasExported);
          const Icon = step.icon;
          const isLast = index === STEPS.length - 1;

          return (
            <li key={step.id} className={cn("flex flex-1 items-center", isLast && "flex-none")}>
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 sm:flex-row sm:gap-2.5">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    state === "complete" &&
                      "border-primary bg-primary text-primary-foreground",
                    state === "current" &&
                      "border-primary bg-primary/15 text-primary shadow-[0_0_16px_hsl(var(--primary)/0.25)]",
                    state === "upcoming" &&
                      "border-border bg-muted/50 text-muted-foreground"
                  )}
                >
                  {state === "complete" ? (
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  ) : state === "current" ? (
                    <Icon className="h-4 w-4" />
                  ) : (
                    <Circle className="h-3 w-3 fill-current" />
                  )}
                </div>
                <div className="hidden min-w-0 text-center sm:block sm:text-left">
                  <div
                    className={cn(
                      "text-xs font-semibold leading-none",
                      state === "upcoming" ? "text-muted-foreground" : "text-foreground"
                    )}
                  >
                    {step.label}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {step.description}
                  </div>
                </div>
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "mx-1 hidden h-0.5 flex-1 rounded-full sm:block",
                    state === "complete" ? "bg-primary/60" : "bg-border"
                  )}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Compact status dot for sidebar project rows. */
export function ProjectStatusDot({
  project,
  hasClips,
}: {
  project: Project;
  hasClips: boolean;
}) {
  let color = "bg-muted-foreground/40";
  if (project.transcript_status === "completed" && hasClips) {
    color = "bg-emerald-500";
  } else if (project.transcript_status === "completed") {
    color = "bg-primary";
  } else if (
    project.transcript_status === "transcribing" ||
    project.transcript_status === "extracting_audio"
  ) {
    color = "bg-amber-500 animate-pulse";
  }

  return (
    <span
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", color)}
      title={
        hasClips
          ? "Clips ready"
          : project.transcript_status === "completed"
            ? "Transcribed"
            : "In progress"
      }
    />
  );
}
