import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Root of bundled assets (dev repo tree or production extraResources). */
export function getAssetsBasePath(): string {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  return isDev
    ? path.join(__dirname, "../../assets")
    : path.join(process.resourcesPath, "assets");
}

export function getTranscriberPath(): string {
  const base = path.join(getAssetsBasePath(), "bin", "transcriber");
  return process.platform === "win32" ? `${base}.exe` : base;
}

export function getModelPath(): string {
  return path.join(getAssetsBasePath(), "models", "whisper-base");
}

export function getEditorPath(): string {
  const base = path.join(getAssetsBasePath(), "bin", "editor");
  return process.platform === "win32" ? `${base}.exe` : base;
}

function getBundledFfmpegDir(): string {
  const platformDir = process.platform === "win32" ? "windows" : "macos";
  return path.join(getAssetsBasePath(), "ffmpeg", platformDir);
}

/** Returns the bundled FFmpeg binary path when present, otherwise null. */
export function getBundledFfmpegPath(): string | null {
  const ext = process.platform === "win32" ? ".exe" : "";
  const ffmpegPath = path.join(getBundledFfmpegDir(), `ffmpeg${ext}`);
  return existsSync(ffmpegPath) ? ffmpegPath : null;
}

/** Returns the bundled FFprobe binary path when present, otherwise null. */
export function getBundledFfprobePath(): string | null {
  const ext = process.platform === "win32" ? ".exe" : "";
  const probePath = path.join(getBundledFfmpegDir(), `ffprobe${ext}`);
  return existsSync(probePath) ? probePath : null;
}

/** User override → bundled binary → system PATH. */
export function resolveFfmpegPath(ffmpegOverride?: string | null): string {
  if (ffmpegOverride && existsSync(ffmpegOverride)) {
    return ffmpegOverride;
  }
  return getBundledFfmpegPath() ?? "ffmpeg";
}

/** Derive ffprobe next to a custom ffmpeg, else bundled, else PATH. */
export function resolveFfprobePath(ffmpegOverride?: string | null): string {
  if (ffmpegOverride && existsSync(ffmpegOverride)) {
    const dir = path.dirname(ffmpegOverride);
    const ext = process.platform === "win32" ? ".exe" : "";
    const probePath = path.join(dir, `ffprobe${ext}`);
    if (existsSync(probePath)) return probePath;
  }
  return getBundledFfprobePath() ?? "ffprobe";
}
