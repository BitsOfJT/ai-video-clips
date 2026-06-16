export const APP_NAME = "AI Video Clipper";
export const APP_VERSION = "0.1.0";

export const SUPPORTED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".mkv", ".avi", ".webm"];

export const IPC_CHANNELS = {
  VIDEO_PROBE_METADATA: "video:probeMetadata",
  DB_GET_PROJECTS: "db:getProjects",
  DB_CREATE_PROJECT: "db:createProject",
} as const;

export const VALID_IPC_CHANNELS = Object.values(IPC_CHANNELS) as readonly string[];

export const WINDOW = {
  WIDTH: 1400,
  HEIGHT: 900,
  MIN_WIDTH: 1000,
  MIN_HEIGHT: 700,
} as const;

export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';";
