import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const platformDir = process.platform === "win32" ? "windows" : "macos";
const ext = process.platform === "win32" ? ".exe" : "";
const bundled = join(ROOT, "assets", "ffmpeg", platformDir, `ffmpeg${ext}`);

/** Bundled FFmpeg when present, otherwise rely on system PATH. */
export function getFfmpegCommand() {
  return existsSync(bundled) ? bundled : "ffmpeg";
}
