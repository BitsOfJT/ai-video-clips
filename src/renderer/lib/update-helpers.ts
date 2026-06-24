interface InstallGuardState {
  transcriptionProgress: Record<string, number>;
  analysisProgress: Record<string, number>;
  exportQueue: string[];
  exportStatus: Record<string, string>;
}

/** Returns false when transcription, analysis, or export work is in progress. */
export function canInstallUpdate(state: InstallGuardState): boolean {
  if (Object.keys(state.transcriptionProgress).length > 0) {
    return false;
  }
  if (Object.keys(state.analysisProgress).length > 0) {
    return false;
  }
  if (state.exportQueue.length > 0) {
    return false;
  }
  const activeExport = Object.values(state.exportStatus).some(
    (status) => status === "queued" || status === "rendering"
  );
  return !activeExport;
}
