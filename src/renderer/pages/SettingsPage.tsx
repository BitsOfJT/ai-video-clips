import SettingsPanel from "@/renderer/components/SettingsPanel";
import { Button } from "@/renderer/components/ui/button";
import { useAppStore } from "@/renderer/store/useAppStore";
import { ArrowLeft } from "lucide-react";

/** Settings view: AI provider configuration (pulled forward from Phase 6). */
export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => useAppStore.getState().setView("home")}
          title="Back to home"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Configure how clips are analyzed.</p>
        </div>
      </div>
      <SettingsPanel />
    </div>
  );
}
