import { create } from "zustand";
import type {
  Project,
  VideoMetadata,
  Clip,
  AppSettings,
  UpdateSettingsInput,
  StartAnalysisInput,
  AnalysisStatus,
  SystemHealthCheck,
  UpdateStatus,
} from "@/types/electron";
import { IPC_CHANNELS } from "@/constants";
import { canInstallUpdate } from "@/renderer/lib/update-helpers";

type ElectronChannel = import("@/types/electron").ElectronChannel;

export type AppView = "home" | "settings";

interface AppState {
  projects: Project[];
  currentProjectId: string | null;
  view: AppView;
  setView: (view: AppView) => void;
  isImporting: boolean;
  importError: string | null;
  loadError: string | null;
  transcriptionProgress: Record<string, number>; // projectId -> percent
  transcriptionError: Record<string, string>;   // projectId -> error message
  analysisProgress: Record<string, number>;      // projectId -> percent
  analysisStage: Record<string, AnalysisStatus>; // projectId -> stage
  analysisError: Record<string, string>;         // projectId -> error message
  clips: Record<string, Clip[]>;                 // projectId -> clips
  settings: AppSettings | null;
  selectedClipId: string | null;
  setSelectedClipId: (id: string | null) => void;
  exportQueue: string[];
  exportProgress: Record<string, number>;        // clipId -> percent
  exportStatus: Record<string, "idle" | "queued" | "rendering" | "completed" | "failed">; // clipId -> status
  exportError: Record<string, string>;           // clipId -> error message
  exportOutputPaths: Record<string, string>;     // clipId -> output path
  exportIncludeCaptions: boolean;
  setExportIncludeCaptions: (include: boolean) => void;
  systemHealth: SystemHealthCheck | null;
  healthLoading: boolean;
  updateStatus: UpdateStatus | null;
  updateBannerDismissed: boolean;
  dismissedUpdateVersion: string | null;
  checkSystemHealth: () => Promise<void>;
  setProjects: (projects: Project[]) => void;
  setCurrentProjectId: (id: string | null) => void;
  loadProjects: () => Promise<void>;
  importProject: (videoPath: string) => Promise<void>;
  startTranscription: (projectId: string, extractAudio: boolean) => Promise<void>;
  updateProjectTranscript: (projectId: string, transcriptJson: string) => void;
  startAnalysis: (input: StartAnalysisInput) => Promise<void>;
  loadClips: (projectId: string) => Promise<void>;
  loadSettings: () => Promise<void>;
  saveSettings: (input: UpdateSettingsInput) => Promise<void>;
  updateClip: (clipId: string, updates: Partial<Clip>) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  startExport: (clipId: string) => Promise<void>;
  startExportBatch: (projectId: string, clipIds: string[]) => Promise<void>;
  cancelExport: (clipId: string) => Promise<void>;
  loadUpdateStatus: () => Promise<void>;
  checkUpdate: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  dismissUpdateBanner: () => void;
}

async function invokeIpc<T>(channel: ElectronChannel, ...args: unknown[]): Promise<T> {
  return window.electronAPI.invoke<T>(channel, ...args);
}

// Register one-way IPC listeners only once after preload exposes electronAPI.
let listenersRegistered = false;

type ZustandSet = (
  partial: AppState | Partial<AppState> | ((state: AppState) => AppState | Partial<AppState>)
) => void;
type ZustandGet = () => AppState;

function registerIpcListeners(set: ZustandSet, get: ZustandGet): void {
  if (listenersRegistered || typeof window.electronAPI === "undefined") {
    return;
  }
  listenersRegistered = true;

  window.electronAPI.onTranscriptionProgress((payload) => {
      set((state) => ({
        transcriptionProgress: { ...state.transcriptionProgress, [payload.projectId]: payload.percent },
      }));
    });

    window.electronAPI.onTranscriptionComplete((payload) => {
      set((state) => {
        const nextProgress = { ...state.transcriptionProgress };
        delete nextProgress[payload.projectId];
        return { transcriptionProgress: nextProgress };
      });
      // Refresh projects so the transcript JSON loads into state.
      // This is intentionally called outside the set() callback to avoid a side effect inside it.
      void get().loadProjects();
    });

    window.electronAPI.onTranscriptionError((payload) => {
      set((state) => ({
        transcriptionError: { ...state.transcriptionError, [payload.projectId]: payload.error },
        transcriptionProgress: { ...state.transcriptionProgress, [payload.projectId]: 0 },
      }));
    });

    window.electronAPI.onAnalysisProgress((payload) => {
      set((state) => ({
        analysisProgress: { ...state.analysisProgress, [payload.projectId]: payload.percent },
        analysisStage: { ...state.analysisStage, [payload.projectId]: payload.stage as AnalysisStatus },
      }));
    });

    window.electronAPI.onAnalysisComplete((payload) => {
      set((state) => {
        const nextProgress = { ...state.analysisProgress };
        delete nextProgress[payload.projectId];
        const nextStage = { ...state.analysisStage };
        delete nextStage[payload.projectId];
        return { analysisProgress: nextProgress, analysisStage: nextStage };
      });
      // Load the freshly persisted clips and refresh project status.
      void get().loadClips(payload.projectId);
      void get().loadProjects();
    });

    window.electronAPI.onAnalysisError((payload) => {
      set((state) => {
        const nextProgress = { ...state.analysisProgress };
        delete nextProgress[payload.projectId];
        return {
          analysisError: { ...state.analysisError, [payload.projectId]: payload.error },
          analysisProgress: nextProgress,
        };
      });
    });

    window.electronAPI.onExportProgress((payload) => {
      set((state) => ({
        exportProgress: { ...state.exportProgress, [payload.clipId]: payload.percent },
        exportStatus: { ...state.exportStatus, [payload.clipId]: "rendering" },
      }));
    });

    window.electronAPI.onExportComplete((payload) => {
      set((state) => {
        const nextQueue = state.exportQueue.filter((id) => id !== payload.clipId);
        return {
          exportQueue: nextQueue,
          exportStatus: { ...state.exportStatus, [payload.clipId]: "completed" },
          exportOutputPaths: { ...state.exportOutputPaths, [payload.clipId]: payload.outputPath },
        };
      });
      const currentProjId = get().currentProjectId;
      if (currentProjId) {
        void get().loadClips(currentProjId);
      }
    });

    window.electronAPI.onExportError((payload) => {
      set((state) => {
        const nextQueue = state.exportQueue.filter((id) => id !== payload.clipId);
        const nextOutputPaths = { ...state.exportOutputPaths };
        delete nextOutputPaths[payload.clipId];
        return {
          exportQueue: nextQueue,
          exportStatus: { ...state.exportStatus, [payload.clipId]: "failed" },
          exportError: { ...state.exportError, [payload.clipId]: payload.error },
          exportOutputPaths: nextOutputPaths,
        };
      });
      const currentProjId = get().currentProjectId;
      if (currentProjId) {
        void get().loadClips(currentProjId);
      }
    });

    window.electronAPI.onUpdateStatus((payload) => {
      set((state) => {
        const patch: Partial<AppState> = { updateStatus: payload };
        if (
          payload.state === "available" &&
          payload.availableVersion &&
          state.dismissedUpdateVersion !== payload.availableVersion
        ) {
          patch.updateBannerDismissed = false;
        }
        return patch;
      });
    });
}

/** Call after mount when preload has exposed window.electronAPI. */
export function initIpcListeners(): void {
  registerIpcListeners(useAppStore.setState, useAppStore.getState);
}

export const useAppStore = create<AppState>((set, get) => {
  return {
    projects: [],
    currentProjectId: null,
    view: "home",
    setView: (view) => set({ view }),
    isImporting: false,
    importError: null,
    loadError: null,
    transcriptionProgress: {},
    transcriptionError: {},
    analysisProgress: {},
    analysisStage: {},
    analysisError: {},
    clips: {},
    settings: null,
    selectedClipId: null,
    setSelectedClipId: (id) => set({ selectedClipId: id }),
    setExportIncludeCaptions: (include) => set({ exportIncludeCaptions: include }),
    exportQueue: [],
    exportProgress: {},
    exportStatus: {},
    exportError: {},
    exportOutputPaths: {},
    exportIncludeCaptions: true,
    systemHealth: null,
    healthLoading: true,
    updateStatus: null,
    updateBannerDismissed: false,
    dismissedUpdateVersion: null,

    checkSystemHealth: async () => {
      set({ healthLoading: true });
      try {
        const result = await invokeIpc<SystemHealthCheck>(IPC_CHANNELS.SYSTEM_HEALTH_CHECK);
        set({ systemHealth: result, healthLoading: false });
      } catch (error) {
        console.error("System health check failed:", error);
        const detail = error instanceof Error ? error.message : String(error);
        set({
          systemHealth: {
            ready: false,
            checks: [
              {
                ok: false,
                label: "Health check",
                path: "",
                message: `Could not run system health check: ${detail}`,
              },
            ],
          },
          healthLoading: false,
        });
      }
    },

    setProjects: (projects) => set({ projects }),

    setCurrentProjectId: (id) => set({ currentProjectId: id }),

    loadProjects: async () => {
      try {
        const projects = await invokeIpc<Project[]>(IPC_CHANNELS.DB_GET_PROJECTS);
        set({ projects, loadError: null });
      } catch (error) {
        set({ loadError: error instanceof Error ? error.message : String(error) });
      }
    },

    importProject: async (videoPath: string) => {
      set({ isImporting: true, importError: null });

      try {
        const metadata = await invokeIpc<VideoMetadata>(
          IPC_CHANNELS.VIDEO_PROBE_METADATA,
          videoPath
        );

        const project = await invokeIpc<Project>(IPC_CHANNELS.DB_CREATE_PROJECT, {
          videoPath,
          metadata,
        });

        set((state) => ({
          projects: [project, ...state.projects],
          currentProjectId: project.id,
        }));
      } catch (error) {
        set({
          importError:
            error instanceof Error ? error.message : "Failed to import video",
        });
      } finally {
        set({ isImporting: false });
      }
    },

    startTranscription: async (projectId: string, extractAudio: boolean) => {
      set((state) => ({
        transcriptionProgress: { ...state.transcriptionProgress, [projectId]: 0 },
        transcriptionError: { ...state.transcriptionError, [projectId]: "" },
      }));

      try {
        await invokeIpc<void>(IPC_CHANNELS.TRANSCRIPTION_START, projectId, extractAudio);
      } catch (error) {
        set((state) => ({
          transcriptionError: {
            ...state.transcriptionError,
            [projectId]: error instanceof Error ? error.message : "Transcription failed",
          },
          transcriptionProgress: { ...state.transcriptionProgress, [projectId]: 0 },
        }));
      }
    },

    updateProjectTranscript: (projectId, transcriptJson) =>
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === projectId ? { ...p, transcript_json: transcriptJson } : p
        ),
      })),

    startAnalysis: async (input: StartAnalysisInput) => {
      set((state) => ({
        analysisProgress: { ...state.analysisProgress, [input.projectId]: 0 },
        analysisStage: { ...state.analysisStage, [input.projectId]: "chunking" },
        analysisError: { ...state.analysisError, [input.projectId]: "" },
      }));

      try {
        await invokeIpc<void>(IPC_CHANNELS.ANALYSIS_START, input);
      } catch (error) {
        set((state) => {
          const nextProgress = { ...state.analysisProgress };
          delete nextProgress[input.projectId];
          return {
            analysisError: {
              ...state.analysisError,
              [input.projectId]: error instanceof Error ? error.message : "Analysis failed",
            },
            analysisProgress: nextProgress,
          };
        });
      }
    },

    loadClips: async (projectId: string) => {
      try {
        const clips = await invokeIpc<Clip[]>(IPC_CHANNELS.DB_GET_CLIPS, projectId);
        set((state) => {
          const exportOutputPaths = { ...state.exportOutputPaths };
          const exportStatus = { ...state.exportStatus };
          for (const clip of clips) {
            if (clip.status === "completed" && clip.output_path) {
              exportOutputPaths[clip.id] = clip.output_path;
              exportStatus[clip.id] = "completed";
            }
          }
          return {
            clips: { ...state.clips, [projectId]: clips },
            exportOutputPaths,
            exportStatus,
          };
        });
      } catch {
        // Non-fatal: the grid simply stays empty if clips cannot be loaded.
      }
    },

    loadSettings: async () => {
      try {
        const settings = await invokeIpc<AppSettings>(IPC_CHANNELS.SETTINGS_GET);
        set({ settings });
      } catch {
        // Ignore; Settings panel will show defaults.
      }
    },

    saveSettings: async (input: UpdateSettingsInput) => {
      const settings = await invokeIpc<AppSettings>(IPC_CHANNELS.SETTINGS_SET, input);
      set({ settings });
    },

    updateClip: async (clipId, updates) => {
      try {
        await invokeIpc<void>(IPC_CHANNELS.CLIP_UPDATE, clipId, updates);
        const currentProjId = get().currentProjectId;
        if (currentProjId) {
          set((state) => {
            const projectClips = state.clips[currentProjId] || [];
            const nextClips = projectClips.map((c) =>
              c.id === clipId ? { ...c, ...updates } : c
            );
            return {
              clips: { ...state.clips, [currentProjId]: nextClips },
            };
          });
        }
      } catch (error) {
        console.error("Failed to update clip:", error);
      }
    },

    deleteProject: async (projectId) => {
      await invokeIpc<void>(IPC_CHANNELS.DB_DELETE_PROJECT, projectId);

      set((state) => {
        const projectClips = state.clips[projectId] ?? [];
        const clipIdSet = new Set(projectClips.map((c) => c.id));

        const nextClips = { ...state.clips };
        delete nextClips[projectId];

        const nextExportQueue = state.exportQueue.filter((id) => !clipIdSet.has(id));
        const nextExportProgress = { ...state.exportProgress };
        const nextExportStatus = { ...state.exportStatus };
        const nextExportError = { ...state.exportError };
        const nextExportOutputPaths = { ...state.exportOutputPaths };
        for (const clipId of clipIdSet) {
          delete nextExportProgress[clipId];
          delete nextExportStatus[clipId];
          delete nextExportError[clipId];
          delete nextExportOutputPaths[clipId];
        }

        const nextTranscriptionProgress = { ...state.transcriptionProgress };
        const nextTranscriptionError = { ...state.transcriptionError };
        delete nextTranscriptionProgress[projectId];
        delete nextTranscriptionError[projectId];

        const nextAnalysisProgress = { ...state.analysisProgress };
        const nextAnalysisStage = { ...state.analysisStage };
        const nextAnalysisError = { ...state.analysisError };
        delete nextAnalysisProgress[projectId];
        delete nextAnalysisStage[projectId];
        delete nextAnalysisError[projectId];

        const deletedCurrent = state.currentProjectId === projectId;
        const deletedSelected = projectClips.some((c) => c.id === state.selectedClipId);

        return {
          projects: state.projects.filter((p) => p.id !== projectId),
          clips: nextClips,
          currentProjectId: deletedCurrent ? null : state.currentProjectId,
          selectedClipId: deletedSelected ? null : state.selectedClipId,
          exportQueue: nextExportQueue,
          exportProgress: nextExportProgress,
          exportStatus: nextExportStatus,
          exportError: nextExportError,
          exportOutputPaths: nextExportOutputPaths,
          transcriptionProgress: nextTranscriptionProgress,
          transcriptionError: nextTranscriptionError,
          analysisProgress: nextAnalysisProgress,
          analysisStage: nextAnalysisStage,
          analysisError: nextAnalysisError,
        };
      });
    },

    startExport: async (clipId) => {
      set((state) => {
        if (state.exportQueue.includes(clipId)) return {};
        return {
          exportQueue: [...state.exportQueue, clipId],
          exportStatus: { ...state.exportStatus, [clipId]: "queued" },
          exportProgress: { ...state.exportProgress, [clipId]: 0 },
          exportError: { ...state.exportError, [clipId]: "" },
        };
      });

      try {
        const started = await invokeIpc<boolean>(
          IPC_CHANNELS.EXPORT_START,
          clipId,
          get().exportIncludeCaptions
        );
        if (!started) {
          set((state) => {
            const nextQueue = state.exportQueue.filter((id) => id !== clipId);
            const nextStatus = { ...state.exportStatus };
            delete nextStatus[clipId];
            const nextProgress = { ...state.exportProgress };
            delete nextProgress[clipId];
            return { exportQueue: nextQueue, exportStatus: nextStatus, exportProgress: nextProgress };
          });
        }
      } catch (error) {
        set((state) => {
          const nextQueue = state.exportQueue.filter((id) => id !== clipId);
          return {
            exportQueue: nextQueue,
            exportStatus: { ...state.exportStatus, [clipId]: "failed" },
            exportError: {
              ...state.exportError,
              [clipId]: error instanceof Error ? error.message : "Export failed to start",
            },
          };
        });
      }
    },

    startExportBatch: async (projectId, clipIds) => {
      if (clipIds.length === 0) return;

      set((state) => {
        const nextQueue = [...state.exportQueue];
        const nextStatus = { ...state.exportStatus };
        const nextProgress = { ...state.exportProgress };
        const nextError = { ...state.exportError };

        for (const clipId of clipIds) {
          if (nextQueue.includes(clipId)) continue;
          nextQueue.push(clipId);
          nextStatus[clipId] = "queued";
          nextProgress[clipId] = 0;
          nextError[clipId] = "";
        }

        return {
          exportQueue: nextQueue,
          exportStatus: nextStatus,
          exportProgress: nextProgress,
          exportError: nextError,
        };
      });

      try {
        const started = await invokeIpc<boolean>(
          IPC_CHANNELS.EXPORT_START_BATCH,
          projectId,
          clipIds,
          get().exportIncludeCaptions
        );
        if (!started) {
          set((state) => {
            const nextQueue = state.exportQueue.filter((id) => !clipIds.includes(id));
            const nextStatus = { ...state.exportStatus };
            const nextProgress = { ...state.exportProgress };
            for (const clipId of clipIds) {
              delete nextStatus[clipId];
              delete nextProgress[clipId];
            }
            return { exportQueue: nextQueue, exportStatus: nextStatus, exportProgress: nextProgress };
          });
        }
      } catch (error) {
        set((state) => {
          const nextQueue = state.exportQueue.filter((id) => !clipIds.includes(id));
          const nextStatus = { ...state.exportStatus };
          const nextError = { ...state.exportError };
          for (const clipId of clipIds) {
            nextStatus[clipId] = "failed";
            nextError[clipId] =
              error instanceof Error ? error.message : "Batch export failed to start";
          }
          return { exportQueue: nextQueue, exportStatus: nextStatus, exportError: nextError };
        });
      }
    },

    cancelExport: async (clipId) => {
      try {
        await invokeIpc<void>(IPC_CHANNELS.EXPORT_CANCEL, clipId);
      } catch (error) {
        console.error("Failed to cancel export:", error);
      } finally {
        set((state) => {
          const nextQueue = state.exportQueue.filter((id) => id !== clipId);
          return {
            exportQueue: nextQueue,
            exportStatus: { ...state.exportStatus, [clipId]: "idle" },
          };
        });
        const currentProjId = get().currentProjectId;
        if (currentProjId) {
          void get().loadClips(currentProjId);
        }
      }
    },

    loadUpdateStatus: async () => {
      try {
        const status = await invokeIpc<UpdateStatus>(IPC_CHANNELS.UPDATE_GET_STATUS);
        set({ updateStatus: status });
      } catch (error) {
        console.error("Failed to load update status:", error);
      }
    },

    checkUpdate: async () => {
      set({ updateBannerDismissed: false, dismissedUpdateVersion: null });
      try {
        await invokeIpc<void>(IPC_CHANNELS.UPDATE_CHECK);
      } catch (error) {
        console.error("Update check failed:", error);
      }
    },

    downloadUpdate: async () => {
      try {
        await invokeIpc<void>(IPC_CHANNELS.UPDATE_DOWNLOAD);
      } catch (error) {
        console.error("Update download failed:", error);
      }
    },

    installUpdate: async () => {
      const state = get();
      if (!canInstallUpdate(state)) {
        return;
      }
      try {
        await invokeIpc<void>(IPC_CHANNELS.UPDATE_INSTALL);
      } catch (error) {
        console.error("Update install failed:", error);
      }
    },

    dismissUpdateBanner: () =>
      set((state) => ({
        updateBannerDismissed: true,
        dismissedUpdateVersion: state.updateStatus?.availableVersion ?? state.dismissedUpdateVersion,
      })),
  };
});
