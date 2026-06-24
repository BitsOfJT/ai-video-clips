import SettingsPanel from "@/renderer/components/SettingsPanel";
import { Button } from "@/renderer/components/ui/button";
import { useAppStore } from "@/renderer/store/useAppStore";
import { ArrowLeft, Settings } from "lucide-react";

export default function SettingsPage() {
  const setView = useAppStore((state) => state.setView);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setView("home")}
          title="Back to home"
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">AI provider, models, and FFmpeg paths.</p>
          </div>
        </div>
      </div>
      <SettingsPanel />
    </div>
  );
}
