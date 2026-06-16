export interface VideoMetadata {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
}

export interface Project {
  id: string;
  video_path: string;
  title: string | null;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  status: string;
  created_at: string;
}

export interface CreateProjectInput {
  videoPath: string;
  metadata: VideoMetadata;
}

export type ElectronChannel =
  | "video:probeMetadata"
  | "db:getProjects"
  | "db:createProject";

export interface ElectronAPI {
  invoke: <T>(channel: ElectronChannel, ...args: unknown[]) => Promise<T>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
