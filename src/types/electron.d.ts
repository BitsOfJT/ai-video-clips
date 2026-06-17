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

export type AIProvider = "gemini" | "ollama";
export type VideoType = "podcast" | "vlog";

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

export interface AppSettings {
  provider: AIProvider;
  /** True when an encrypted Gemini key is stored; the key itself is never returned to the renderer. */
  hasGeminiKey: boolean;
  ollamaBaseUrl: string;
  ollamaTextModel: string;
  ollamaVisionModel: string;
}

/** Renderer -> main settings write. `geminiApiKey` is encrypted at rest and omitted from reads. */
export interface UpdateSettingsInput {
  provider?: AIProvider;
  geminiApiKey?: string;
  ollamaBaseUrl?: string;
  ollamaTextModel?: string;
  ollamaVisionModel?: string;
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
  | "export:cancel"
  | "export:progress"
  | "export:complete"
  | "export:error"
  | "shell:showItem";

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
  removeAllListeners: (channel: ElectronChannel) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
