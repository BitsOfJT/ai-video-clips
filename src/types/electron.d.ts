export interface VideoMetadata {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
}

export type TranscriptionStatus = "idle" | "extracting_audio" | "transcribing" | "completed" | "failed";

export interface TranscriptionProgressPayload {
  projectId: string;
  percent: number;
}

export interface TranscriptionCompletePayload {
  projectId: string;
}

export interface TranscriptionErrorPayload {
  projectId: string;
  error: string;
}

export interface TranscriptWord {
  start: number;
  end: number;
  word: string;
  probability: number;
}

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  words: TranscriptWord[];
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
  transcript_status: TranscriptionStatus | null;
  transcript_json: string | null;
  created_at: string;
}

export interface CreateProjectInput {
  videoPath: string;
  metadata: VideoMetadata;
}

export type ElectronChannel =
  | "video:probeMetadata"
  | "db:getProjects"
  | "db:createProject"
  | "transcription:start"
  | "transcription:progress"
  | "transcription:complete"
  | "transcription:error";

export interface ElectronAPI {
  invoke: <T>(channel: ElectronChannel, ...args: unknown[]) => Promise<T>;
  // One-way listeners (preloaded in renderer)
  onTranscriptionProgress: (callback: (payload: TranscriptionProgressPayload) => void) => void;
  onTranscriptionComplete: (callback: (payload: TranscriptionCompletePayload) => void) => void;
  onTranscriptionError: (callback: (payload: TranscriptionErrorPayload) => void) => void;
  removeAllListeners: (channel: ElectronChannel) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
