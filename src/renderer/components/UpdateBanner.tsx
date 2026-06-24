import { Download, X } from "lucide-react";
import { Button } from "@/renderer/components/ui/button";
import { useAppStore } from "@/renderer/store/useAppStore";
import { canInstallUpdate } from "@/renderer/lib/update-helpers";

export default function UpdateBanner() {
  const updateStatus = useAppStore((state) => state.updateStatus);
  const updateBannerDismissed = useAppStore((state) => state.updateBannerDismissed);
  const dismissedUpdateVersion = useAppStore((state) => state.dismissedUpdateVersion);
  const dismissUpdateBanner = useAppStore((state) => state.dismissUpdateBanner);
  const downloadUpdate = useAppStore((state) => state.downloadUpdate);
  const installUpdate = useAppStore((state) => state.installUpdate);
  const transcriptionProgress = useAppStore((state) => state.transcriptionProgress);
  const analysisProgress = useAppStore((state) => state.analysisProgress);
  const exportQueue = useAppStore((state) => state.exportQueue);
  const exportStatus = useAppStore((state) => state.exportStatus);

  if (!updateStatus) {
    return null;
  }

  const dismissedForThisVersion =
    updateBannerDismissed &&
    dismissedUpdateVersion != null &&
    dismissedUpdateVersion === updateStatus.availableVersion;

  if (dismissedForThisVersion) {
    return null;
  }

  const { state, availableVersion, downloadProgress } = updateStatus;
  const installAllowed = canInstallUpdate({
    transcriptionProgress,
    analysisProgress,
    exportQueue,
    exportStatus,
  });

  if (state !== "available" && state !== "downloaded" && state !== "downloading") {
    return null;
  }

  const isMac = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");
  const versionLabel = availableVersion ? `v${availableVersion}` : "a new version";

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-4 border-b border-primary/20 bg-primary/10 px-4 py-2.5 text-sm"
    >
      <div className="min-w-0 flex-1">
        {state === "downloading" ? (
          <span>
            Downloading update {versionLabel}
            {downloadProgress != null ? ` — ${downloadProgress}%` : "…"}
          </span>
        ) : state === "downloaded" ? (
          <span>Update {versionLabel} is ready to install.</span>
        ) : (
          <span>Update {versionLabel} is available.</span>
        )}
        {!installAllowed && state === "downloaded" && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Finish transcription, analysis, or export before restarting.
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {state === "available" && (
          <Button size="sm" variant="secondary" onClick={() => void downloadUpdate()}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {isMac ? "Download" : "Download update"}
          </Button>
        )}
        {state === "downloaded" && (
          <Button
            size="sm"
            onClick={() => void installUpdate()}
            disabled={!installAllowed}
          >
            Restart to install
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={dismissUpdateBanner}
          aria-label="Dismiss update notification"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
