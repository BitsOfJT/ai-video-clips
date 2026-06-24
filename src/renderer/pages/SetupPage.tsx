import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Settings,
  Wrench,
} from "lucide-react";
import type { SystemHealthCheck } from "@/types/electron";
import { Button } from "@/renderer/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/renderer/components/ui/card";
import { cn } from "@/renderer/lib/utils";

interface SetupPageProps {
  health: SystemHealthCheck;
  isRechecking: boolean;
  onRecheck: () => void;
  onOpenSettings: () => void;
  onContinue: () => void;
}

export default function SetupPage({
  health,
  isRechecking,
  onRecheck,
  onOpenSettings,
  onContinue,
}: SetupPageProps) {
  const [showDetails, setShowDetails] = useState(true);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-4">
      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/25">
          <Wrench className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Setup Check</h1>
        <p className="text-sm text-muted-foreground">
          Verify bundled tools and AI dependencies before importing your first video.
        </p>
      </div>

      <Card className="surface-card overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            {health.ready ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Ready to go
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5 text-amber-500" />
                Action required
              </>
            )}
          </CardTitle>
          <CardDescription>
            {health.ready
              ? "All required dependencies are available."
              : "Fix the items below, then re-run the check."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="divide-y divide-border rounded-md border border-border">
            {health.checks.map((check) => (
              <li
                key={check.label}
                className="flex items-start gap-3 px-4 py-3 text-sm"
              >
                {check.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{check.label}</div>
                  {check.path && (
                    <div className="truncate text-xs text-muted-foreground" title={check.path}>
                      {check.path}
                    </div>
                  )}
                  {check.message && (
                    <p
                      className={cn(
                        "mt-1 text-xs",
                        check.ok ? "text-muted-foreground" : "text-destructive"
                      )}
                    >
                      {check.message}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onRecheck} disabled={isRechecking}>
              {isRechecking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Re-check
            </Button>
            <Button variant="outline" onClick={onOpenSettings}>
              <Settings className="mr-2 h-4 w-4" />
              Open Settings
            </Button>
            {health.ready && (
              <Button onClick={onContinue}>Continue to app</Button>
            )}
            {!health.ready && (
              <Button variant="ghost" onClick={() => setShowDetails(!showDetails)}>
                {showDetails ? "Hide tips" : "Show tips"}
              </Button>
            )}
          </div>

          {!health.ready && showDetails && (
            <div className="rounded-md border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Quick fixes</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  Install{" "}
                  <a
                    href="https://ollama.com"
                    className="text-primary underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ollama
                  </a>{" "}
                  and pull the text + vision models shown above.
                </li>
                <li>
                  Or switch to Gemini in Settings and paste a free API key from{" "}
                  <a
                    href="https://aistudio.google.com/apikey"
                    className="text-primary underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google AI Studio
                  </a>
                  .
                </li>
                <li>
                  In development, run{" "}
                  <code className="rounded bg-muted px-1">npm run download:models</code> and{" "}
                  <code className="rounded bg-muted px-1">npm run build:python</code>.
                </li>
              </ul>
              <Button variant="link" className="h-auto p-0 text-xs" onClick={onContinue}>
                Continue anyway (some features may fail)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
