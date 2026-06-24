export const APP_NAME = "AI Video Clipper";
export const APP_VERSION = "1.0.0";

export const SUPPORTED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".mkv", ".avi", ".webm"];

export const IPC_CHANNELS = {
  VIDEO_PROBE_METADATA: "video:probeMetadata",
  DB_GET_PROJECTS: "db:getProjects",
  DB_CREATE_PROJECT: "db:createProject",
  DB_DELETE_PROJECT: "db:deleteProject",
  DB_GET_CLIPS: "db:getClips",
  TRANSCRIPTION_START: "transcription:start",
  TRANSCRIPTION_PROGRESS: "transcription:progress",
  TRANSCRIPTION_COMPLETE: "transcription:complete",
  TRANSCRIPTION_ERROR: "transcription:error",
  ANALYSIS_START: "analysis:start",
  ANALYSIS_PROGRESS: "analysis:progress",
  ANALYSIS_COMPLETE: "analysis:complete",
  ANALYSIS_ERROR: "analysis:error",
  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",
  CLIP_GET_THUMBNAIL: "clip:getThumbnail",
  CLIP_UPDATE: "clip:update",
  EXPORT_START: "export:start",
  EXPORT_START_BATCH: "export:startBatch",
  EXPORT_CANCEL: "export:cancel",
  EXPORT_PROGRESS: "export:progress",
  EXPORT_COMPLETE: "export:complete",
  EXPORT_ERROR: "export:error",
  SHELL_SHOW_ITEM: "shell:showItem",
  FFMPEG_VALIDATE: "ffmpeg:validate",
  DIALOG_OPEN_FILE: "dialog:openFile",
  OLLAMA_LIST_MODELS: "ollama:listModels",
  SYSTEM_HEALTH_CHECK: "system:healthCheck",
  UPDATE_GET_STATUS: "update:getStatus",
  UPDATE_CHECK: "update:check",
  UPDATE_DOWNLOAD: "update:download",
  UPDATE_INSTALL: "update:install",
  UPDATE_STATUS: "update:status",
} as const;

export const VALID_IPC_CHANNELS = Object.values(IPC_CHANNELS) as readonly string[];

// List of one-way channels used in preload listener setup
export const ONE_WAY_IPC_CHANNELS = [
  IPC_CHANNELS.TRANSCRIPTION_PROGRESS,
  IPC_CHANNELS.TRANSCRIPTION_COMPLETE,
  IPC_CHANNELS.TRANSCRIPTION_ERROR,
  IPC_CHANNELS.ANALYSIS_PROGRESS,
  IPC_CHANNELS.ANALYSIS_COMPLETE,
  IPC_CHANNELS.ANALYSIS_ERROR,
  IPC_CHANNELS.EXPORT_PROGRESS,
  IPC_CHANNELS.EXPORT_COMPLETE,
  IPC_CHANNELS.EXPORT_ERROR,
  IPC_CHANNELS.UPDATE_STATUS,
] as const;

// AI analysis providers. Gemini = free tier (bring-your-own API key);
// Ollama = fully local/offline. The provider layer is pluggable so other
// providers can be added behind the same interface.
export const AI_PROVIDERS = ["gemini", "ollama"] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];

// Chunking presets per video type (durations in seconds).
export const VIDEO_TYPES = ["podcast", "vlog"] as const;
export type VideoType = (typeof VIDEO_TYPES)[number];

export const CHUNK_PRESETS: Record<VideoType, { minSec: number; maxSec: number; pauseGapSec: number }> = {
  // Talking-head: longer, coherent dialogue arcs; only split on real pauses.
  podcast: { minSec: 30, maxSec: 90, pauseGapSec: 0.8 },
  // Fast-paced: shorter chunks; split on smaller gaps.
  vlog: { minSec: 15, maxSec: 45, pauseGapSec: 0.5 },
};

// Number of top text-scored chunks promoted to the vision refinement pass.
export const VISION_SHORTLIST_SIZE = 10;

// Default Ollama endpoint + models (overridable in Settings).
export const OLLAMA_DEFAULTS = {
  baseUrl: "http://localhost:11434",
  textModel: "llama3.1",
  visionModel: "llama3.2-vision",
} as const;

// Default Gemini model (free tier). Verify the current free-tier model name
// and limits at https://ai.google.dev before relying on quotas.
export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";

export const WINDOW = {
  WIDTH: 1400,
  HEIGHT: 900,
  MIN_WIDTH: 1000,
  MIN_HEIGHT: 700,
} as const;

export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; media-src app-video:;";
