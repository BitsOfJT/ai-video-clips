import type { AIProvider, VideoType } from "../constants";

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

export type AnalysisStatus = "idle" | "chunking" | "scoring" | "refining" | "completed" | "failed";

export type { AIProvider, VideoType };

export interface AnalysisProgressPayload {
  projectId: string;
  percent: number;
  stage: AnalysisStatus;
}

export interface AnalysisCompletePayload {
  projectId: string;
}

export interface AnalysisErrorPayload {
  projectId: string;
  error: string;
}

export interface StartAnalysisInput {
  projectId: string;
  creativeBrief: string;
  videoType: VideoType;
}

/** Per-criterion scores returned by the AI, shared between providers and the renderer. */
export interface ClipScores {
  hook_strength: number;
  brief_relevance: number;
  self_containment: number;
  emotional_arc: number;
  platform_fit: number;
}

export interface Clip {
  id: string;
  project_id: string;
  start_ms: number | null;
  end_ms: number | null;
  ai_score: number | null;
  status: string;
  title: string | null;
  description: string | null;
  hook_strength: number | null;
  brief_relevance: number | null;
  self_containment: number | null;
  emotional_arc: number | null;
  platform_fit: number | null;
  reasoning: string | null;
  thumbnail_path: string | null;
  crop_x: number | null;
  crop_y: number | null;
  crop_w: number | null;
  crop_h: number | null;
  output_path: string | null;
  created_at: string;
}

export interface ExportProgressPayload {
  clipId: string;
  percent: number;
}

export interface ExportCompletePayload {
  clipId: string;
  outputPath: string;
}

export interface ExportErrorPayload {
  clipId: string;
  error: string;
}

/** Persisted Long-Form Editor timeline (JSON in `longform_edits.timeline_json`). */
export interface LongFormEditsRow {
  projectId: string;
  timelineJson: string;
  updatedAt: string;
}

export interface LongFormExportProgressPayload {
  projectId: string;
  percent: number;
}

export interface LongFormExportCompletePayload {
  projectId: string;
  outputPath: string;
}

export interface LongFormExportErrorPayload {
  projectId: string;
  error: string;
}

export interface SystemHealthItem {
  ok: boolean;
  label: string;
  path: string;
  message?: string;
  models?: string[];
}

export interface SystemHealthCheck {
  ready: boolean;
  checks: SystemHealthItem[];
}

export type UpdateState =
  | "idle"
  | "checking"
  | "not-available"
  | "available"
  | "downloading"
  | "downloaded"
  | "error"
  | "installing";

export interface UpdateStatus {
  currentVersion: string;
  state: UpdateState;
  availableVersion?: string | null;
  downloadProgress?: number | null;
  error?: string | null;
  manualDownloadUrl?: string | null;
}

export interface AppSettings {
  provider: AIProvider;
  /** True when an encrypted Gemini key is stored; the key itself is never returned to the renderer. */
  hasGeminiKey: boolean;
  ollamaBaseUrl: string;
  ollamaTextModel: string;
  ollamaVisionModel: string;
  /** Custom FFmpeg binary path (empty string = use system PATH). */
  ffmpegPath: string;
}

/** Renderer -> main settings write. `geminiApiKey` is encrypted at rest and omitted from reads. */
export interface UpdateSettingsInput {
  provider?: AIProvider;
  geminiApiKey?: string;
  ollamaBaseUrl?: string;
  ollamaTextModel?: string;
  ollamaVisionModel?: string;
  ffmpegPath?: string;
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
  creative_brief: string | null;
  video_type: VideoType | null;
  analysis_status: AnalysisStatus | null;
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
  | "db:deleteProject"
  | "db:getClips"
  | "transcription:start"
  | "transcription:progress"
  | "transcription:complete"
  | "transcription:error"
  | "analysis:start"
  | "analysis:progress"
  | "analysis:complete"
  | "analysis:error"
  | "settings:get"
  | "settings:set"
  | "clip:getThumbnail"
  | "clip:update"
  | "export:start"
  | "export:startBatch"
  | "export:cancel"
  | "export:progress"
  | "export:complete"
  | "export:error"
  | "longform:getEdits"
  | "longform:saveEdits"
  | "longform:export:start"
  | "longform:export:cancel"
  | "longform:export:progress"
  | "longform:export:complete"
  | "longform:export:error"
  | "longform:saveSrt"
  | "longform:saveThumbnail"
  | "shell:showItem"
  | "ffmpeg:validate"
  | "dialog:openFile"
  | "ollama:listModels"
  | "system:healthCheck"
  | "update:getStatus"
  | "update:check"
  | "update:download"
  | "update:install"
  | "update:status";

export interface ElectronAPI {
  invoke: <T>(channel: ElectronChannel, ...args: unknown[]) => Promise<T>;
  // One-way listeners (preloaded in renderer)
  onTranscriptionProgress: (callback: (payload: TranscriptionProgressPayload) => void) => void;
  onTranscriptionComplete: (callback: (payload: TranscriptionCompletePayload) => void) => void;
  onTranscriptionError: (callback: (payload: TranscriptionErrorPayload) => void) => void;
  onAnalysisProgress: (callback: (payload: AnalysisProgressPayload) => void) => void;
  onAnalysisComplete: (callback: (payload: AnalysisCompletePayload) => void) => void;
  onAnalysisError: (callback: (payload: AnalysisErrorPayload) => void) => void;
  onExportProgress: (callback: (payload: ExportProgressPayload) => void) => void;
  onExportComplete: (callback: (payload: ExportCompletePayload) => void) => void;
  onExportError: (callback: (payload: ExportErrorPayload) => void) => void;
  onLongformExportProgress: (callback: (payload: LongFormExportProgressPayload) => void) => void;
  onLongformExportComplete: (callback: (payload: LongFormExportCompletePayload) => void) => void;
  onLongformExportError: (callback: (payload: LongFormExportErrorPayload) => void) => void;
  onUpdateStatus: (callback: (payload: UpdateStatus) => void) => void;
}

declare global {
  interface DataTransferItem {
    /** File System Access API handle for dropped items (may be unavailable in some packaged Electron builds). */
    getAsFileSystemHandle(): Promise<FileSystemHandle | null>;
  }

  // Augment FileSystemHandle when lib.dom.d.ts only exposes the base interface.
  interface FileSystemFileHandle extends FileSystemHandle {
    getFile(): Promise<File>;
  }

  interface Window {
    electronAPI: ElectronAPI;
  }
}
