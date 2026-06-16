import { create } from "zustand";
import type { Project, VideoMetadata } from "@/types/electron";
import { IPC_CHANNELS } from "@/constants";

type ElectronChannel = import("@/types/electron").ElectronChannel;

interface AppState {
  projects: Project[];
  currentProjectId: string | null;
  isImporting: boolean;
  importError: string | null;
  loadError: string | null;
  transcriptionProgress: Record<string, number>; // projectId -> percent
  transcriptionError: Record<string, string>;   // projectId -> error message
  setProjects: (projects: Project[]) => void;
  setCurrentProjectId: (id: string | null) => void;
  loadProjects: () => Promise<void>;
  importProject: (videoPath: string) => Promise<void>;
  startTranscription: (projectId: string, extractAudio: boolean) => Promise<void>;
  setTranscriptionProgress: (projectId: string, percent: number) => void;
  setTranscriptionError: (projectId: string, error: string | null) => void;
  updateProjectTranscript: (projectId: string, transcriptJson: string) => void;
  clearTranscriptionState: (projectId: string) => void;
}

async function invokeIpc<T>(channel: ElectronChannel, ...args: unknown[]): Promise<T> {
  return window.electronAPI.invoke<T>(channel, ...args);
}

// Register one-way IPC listeners only once, even if the module is re-executed by Vite HMR.
let listenersRegistered = false;

export const useAppStore = create<AppState>((set, get) => {
  if (!listenersRegistered) {
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
  }

  return {
    projects: [],
    currentProjectId: null,
    isImporting: false,
    importError: null,
    loadError: null,
    transcriptionProgress: {},
    transcriptionError: {},

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

    setTranscriptionProgress: (projectId, percent) =>
      set((state) => ({
        transcriptionProgress: { ...state.transcriptionProgress, [projectId]: percent },
      })),

    setTranscriptionError: (projectId, error) =>
      set((state) => ({
        transcriptionError: { ...state.transcriptionError, [projectId]: error ?? "" },
      })),

    updateProjectTranscript: (projectId, transcriptJson) =>
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === projectId ? { ...p, transcript_json: transcriptJson } : p
        ),
      })),

    clearTranscriptionState: (projectId) =>
      set((state) => {
        const nextProgress = { ...state.transcriptionProgress };
        const nextError = { ...state.transcriptionError };
        delete nextProgress[projectId];
        delete nextError[projectId];
        return { transcriptionProgress: nextProgress, transcriptionError: nextError };
      }),
  };
});
