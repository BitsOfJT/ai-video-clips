/**
 * Simple rotating-file logger for the Electron main process.
 *
 * Writes one log file per day to `app.getPath('userData')/logs/`.
 * Automatically prunes logs older than 7 days on initialization.
 */

import { app } from "electron";
import { appendFile, mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";

const MAX_LOG_AGE_DAYS = 7;

let logDir: string | null = null;
let currentLogPath: string | null = null;
let currentLogDate: string | null = null;

function getLogDir(): string {
  if (!logDir) {
    logDir = path.join(app.getPath("userData"), "logs");
  }
  return logDir;
}

function dateStr(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function timeStr(): string {
  return new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
}

function getLogPath(): string {
  const today = dateStr();
  if (currentLogDate !== today || !currentLogPath) {
    currentLogDate = today;
    currentLogPath = path.join(getLogDir(), `${today}.log`);
  }
  return currentLogPath;
}

/** Ensure the log directory exists and prune old files. */
export async function initLogger(): Promise<void> {
  const dir = getLogDir();
  await mkdir(dir, { recursive: true });
  await pruneOldLogs();
}

/** Remove log files older than MAX_LOG_AGE_DAYS. */
async function pruneOldLogs(): Promise<void> {
  const dir = getLogDir();
  try {
    const files = await readdir(dir);
    const cutoff = Date.now() - MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (!file.endsWith(".log")) continue;
      // Parse date from filename (YYYY-MM-DD.log)
      const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})\.log$/);
      if (!dateMatch) continue;
      const fileDate = new Date(dateMatch[1]).getTime();
      if (fileDate < cutoff) {
        try {
          await unlink(path.join(dir, file));
        } catch {
          // Best-effort cleanup
        }
      }
    }
  } catch {
    // Log dir may not exist yet — that's fine
  }
}

/** Append a log entry. All arguments are formatted as a single line. */
async function writeLog(level: string, context: string, message: string, extra?: Record<string, unknown>): Promise<void> {
  const logPath = getLogPath();
  const extraStr = extra ? ` ${JSON.stringify(extra)}` : "";
  const line = `[${timeStr()}] [${level}] [${context}] ${message}${extraStr}\n`;

  try {
    await appendFile(logPath, line, "utf-8");
  } catch {
    // Silently fail — logging should never crash the app
  }
}

export const logger = {
  info: (context: string, message: string, extra?: Record<string, unknown>) =>
    writeLog("INFO", context, message, extra),

  warn: (context: string, message: string, extra?: Record<string, unknown>) =>
    writeLog("WARN", context, message, extra),

  error: (context: string, message: string, extra?: Record<string, unknown>) =>
    writeLog("ERROR", context, message, extra),

  /** Log a subprocess spawn event (command + args). */
  subprocess: (name: string, command: string, args: string[]) =>
    writeLog("INFO", `subprocess:${name}`, `Spawning: ${command} ${args.join(" ")}`),

  /** Log a subprocess exit event. */
  subprocessExit: (name: string, code: number | null, signal: string | null) =>
    writeLog(
      code === 0 ? "INFO" : "ERROR",
      `subprocess:${name}`,
      `Exited`,
      { code, signal }
    ),

  /** Log a subprocess stderr line. */
  subprocessStderr: (name: string, line: string) =>
    writeLog("WARN", `subprocess:${name}`, line.trim()),
};

/**
 * Map common subprocess exit codes to user-friendly error messages.
 */
export function friendlyExitMessage(processName: string, code: number | null): string {
  if (code === null) return `${processName} was killed unexpectedly.`;
  if (code === 0) return "";

  const messages: Record<string, Record<number, string>> = {
    ffprobe: {
      1: "FFmpeg could not read the video file — it may be corrupted or in an unsupported format.",
      127: "FFmpeg/ffprobe was not found. Please install FFmpeg or set its path in Settings.",
    },
    transcriber: {
      1: "Transcription failed — the audio may be corrupted or the model files may be missing.",
      127: "The transcriber binary was not found. Try rebuilding with `npm run build:python`.",
      137: "Transcription was killed (out of memory). Try a smaller Whisper model.",
    },
    editor: {
      1: "Export failed — FFmpeg encountered an encoding error. Check that the input video is valid.",
      127: "The editor binary was not found. Try rebuilding with `npm run build:python`.",
    },
  };

  const processMessages = messages[processName];
  if (processMessages && processMessages[code]) {
    return processMessages[code];
  }

  return `${processName} exited with error code ${code}.`;
}
