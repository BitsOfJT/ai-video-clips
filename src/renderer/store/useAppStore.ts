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
  setProjects: (projects: Project[]) => void;
  setCurrentProjectId: (id: string | null) => void;
  loadProjects: () => Promise<void>;
  importProject: (videoPath: string) => Promise<void>;
}

async function invokeIpc<T>(channel: ElectronChannel, ...args: unknown[]): Promise<T> {
  return window.electronAPI.invoke<T>(channel, ...args);
}

export const useAppStore = create<AppState>((set) => ({
  projects: [],
  currentProjectId: null,
  isImporting: false,
  importError: null,
  loadError: null,

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
}));
