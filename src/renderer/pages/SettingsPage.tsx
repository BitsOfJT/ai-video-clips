import SettingsPanel from "@/renderer/components/SettingsPanel";

/** Settings view: AI provider configuration (pulled forward from Phase 6). */
export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Configure how clips are analyzed.</p>
      </div>
      <SettingsPanel />
    </div>
  );
}
