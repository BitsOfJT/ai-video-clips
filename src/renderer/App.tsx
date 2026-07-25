import { useEffect, useState } from "react";
import Layout from "@/renderer/components/Layout";
import HomePage from "@/renderer/pages/HomePage";
import LongFormEditorPage from "@/renderer/pages/LongFormEditorPage";
import SettingsPage from "@/renderer/pages/SettingsPage";
import SetupPage from "@/renderer/pages/SetupPage";
import { initIpcListeners, useAppStore } from "@/renderer/store/useAppStore";
import { Loader2 } from "lucide-react";

export default function App() {
  const view = useAppStore((state) => state.view);
  const setView = useAppStore((state) => state.setView);
  const health = useAppStore((state) => state.systemHealth);
  const healthLoading = useAppStore((state) => state.healthLoading);
  const checkSystemHealth = useAppStore((state) => state.checkSystemHealth);
  const loadUpdateStatus = useAppStore((state) => state.loadUpdateStatus);
  const [setupDismissed, setSetupDismissed] = useState(false);

  useEffect(() => {
    initIpcListeners();
    void loadUpdateStatus();
  }, [loadUpdateStatus]);

  const showSetup = health && !health.ready && !setupDismissed && view !== "settings";
  const contentWidth = view === "longform" && !showSetup ? "full" : "default";

  return (
    <Layout contentWidth={contentWidth}>
      {healthLoading && health === null ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Checking dependencies…
        </div>
      ) : showSetup ? (
        <SetupPage
          health={health}
          isRechecking={healthLoading}
          onRecheck={() => void checkSystemHealth()}
          onOpenSettings={() => setView("settings")}
          onContinue={() => setSetupDismissed(true)}
        />
      ) : view === "settings" ? (
        <SettingsPage />
      ) : view === "longform" ? (
        <LongFormEditorPage />
      ) : (
        <HomePage />
      )}
    </Layout>
  );
}
