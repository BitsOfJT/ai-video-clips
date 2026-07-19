import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { IPC_CHANNELS } from "../src/constants.js";
import { validateTimeline, totalDurationMs, type LongFormTimeline } from "../src/lib/longform-timeline.js";

export interface LongformExportJob {
  projectId: string;
  videoPath: string;
  outputPath: string;
  timeline: LongFormTimeline;
  ffmpegPath: string;
}

const activeLongformExports = new Map<string, ChildProcess>();
let longformQueue: LongformExportJob[] = [];
let longformProcessing = false;

function sendToRenderer(
  getWindow: () => BrowserWindow | null,
  channel: string,
  payload: unknown
): void {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

function escapeConcatPath(p: string): string {
  return p.replace(/'/g, "'\\''");
}

/**
 * Build eq filter from color settings. Values are mild UI sliders (-1..1-ish).
 */
function buildColorFilter(timeline: LongFormTimeline): string {
  const { exposure, contrast, saturation } = timeline.color;
  const brightness = Math.max(-1, Math.min(1, exposure * 0.15));
  const contrastVal = Math.max(0.5, Math.min(2, 1 + contrast * 0.25));
  const satVal = Math.max(0, Math.min(3, 1 + saturation * 0.35));
  return `eq=brightness=${brightness.toFixed(3)}:contrast=${contrastVal.toFixed(3)}:saturation=${satVal.toFixed(3)}`;
}

/**
 * Render a long-form EDL to a 16:9 (or source) H.264 MP4 via FFmpeg concat.
 * Progress is approximated from out_time on stderr.
 */
export async function runLongformExport(
  job: LongformExportJob,
  getWindow: () => BrowserWindow | null
): Promise<void> {
  const durationMs = totalDurationMs(job.timeline.segments);
  if (durationMs <= 0 || job.timeline.segments.length === 0) {
    throw new Error("Timeline has no media to export");
  }

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "longform-export-"));
  const partPaths: string[] = [];

  try {
    // 1) Trim each segment to a temp file (stream copy when no color filter needed is faster,
    //    but we re-encode for consistent concat + color + loudnorm).
    const colorFilter = buildColorFilter(job.timeline);
    let partIndex = 0;
    for (const seg of job.timeline.segments) {
      const partPath = path.join(tmpDir, `part-${partIndex.toString().padStart(3, "0")}.mp4`);
      partPaths.push(partPath);
      const startSec = seg.sourceStartMs / 1000;
      const durSec = (seg.sourceEndMs - seg.sourceStartMs) / 1000;
      await runFfmpeg(
        job.ffmpegPath,
        [
          "-y",
          "-ss",
          startSec.toFixed(3),
          "-t",
          durSec.toFixed(3),
          "-i",
          job.videoPath,
          "-vf",
          `${colorFilter},scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1`,
          "-af",
          `volume=${Math.max(0, Math.min(2, job.timeline.audio.volume)).toFixed(3)}`,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "20",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-ar",
          "48000",
          "-ac",
          "2",
          partPath,
        ],
        job.projectId,
        getWindow,
        // Progress across parts: each part is a share of total duration
        (seg.sourceEndMs - seg.sourceStartMs) / durationMs,
        partIndex / job.timeline.segments.length
      );
      partIndex += 1;
    }

    // 2) Concat list
    const listPath = path.join(tmpDir, "concat.txt");
    const listBody = partPaths.map((p) => `file '${escapeConcatPath(p)}'`).join("\n");
    await fsp.writeFile(listPath, listBody, "utf8");

    const concatArgs = [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
    ];

    const finalArgs = job.timeline.audio.normalizeLufs
      ? [
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          listPath,
          "-af",
          "loudnorm=I=-14:TP=-1.5:LRA=11",
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          job.outputPath,
        ]
      : [...concatArgs, job.outputPath];

    // loudnorm cannot copy video when re-encoding audio from concat copy easily —
    // if normalize, re-mux with loudnorm on audio only via separate pass:
    if (job.timeline.audio.normalizeLufs) {
      const concatTmp = path.join(tmpDir, "concat-raw.mp4");
      await runFfmpeg(
        job.ffmpegPath,
        ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", concatTmp],
        job.projectId,
        getWindow,
        0.05,
        0.9
      );
      await runFfmpeg(
        job.ffmpegPath,
        [
          "-y",
          "-i",
          concatTmp,
          "-af",
          "loudnorm=I=-14:TP=-1.5:LRA=11",
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          job.outputPath,
        ],
        job.projectId,
        getWindow,
        0.05,
        0.95
      );
    } else {
      await runFfmpeg(job.ffmpegPath, finalArgs, job.projectId, getWindow, 0.1, 0.9);
    }

    sendToRenderer(getWindow, IPC_CHANNELS.LONGFORM_EXPORT_PROGRESS, {
      projectId: job.projectId,
      percent: 100,
    });
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runFfmpeg(
  ffmpegPath: string,
  args: string[],
  projectId: string,
  getWindow: () => BrowserWindow | null,
  progressWeight: number,
  progressBase: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    activeLongformExports.set(projectId, child);

    let stderrBuf = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      // Keep buffer bounded
      if (stderrBuf.length > 8000) stderrBuf = stderrBuf.slice(-4000);
      const match = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderrBuf);
      if (match) {
        const hours = Number(match[1]);
        const mins = Number(match[2]);
        const secs = Number(match[3]);
        const t = hours * 3600 + mins * 60 + secs;
        // Soft progress within this stage
        const local = Math.min(1, t / 60);
        const percent = Math.round((progressBase + local * progressWeight) * 100);
        sendToRenderer(getWindow, IPC_CHANNELS.LONGFORM_EXPORT_PROGRESS, {
          projectId,
          percent: Math.min(99, Math.max(1, percent)),
        });
      }
    });

    child.on("error", (err) => {
      activeLongformExports.delete(projectId);
      reject(err);
    });

    child.on("close", (code) => {
      activeLongformExports.delete(projectId);
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code ?? "unknown"}`));
    });
  });
}

export function enqueueLongformExport(
  job: LongformExportJob,
  getWindow: () => BrowserWindow | null
): void {
  longformQueue.push(job);
  void processLongformQueue(getWindow);
}

export function cancelLongformExport(projectId: string): boolean {
  longformQueue = longformQueue.filter((j) => j.projectId !== projectId);
  const child = activeLongformExports.get(projectId);
  if (child) {
    child.kill("SIGTERM");
    activeLongformExports.delete(projectId);
    return true;
  }
  return false;
}

export function killAllLongformExports(): void {
  for (const child of activeLongformExports.values()) {
    child.kill("SIGTERM");
  }
  activeLongformExports.clear();
  longformQueue = [];
}

async function processLongformQueue(getWindow: () => BrowserWindow | null): Promise<void> {
  if (longformProcessing) return;
  longformProcessing = true;
  try {
    while (longformQueue.length > 0) {
      const job = longformQueue.shift();
      if (!job) break;
      try {
        await runLongformExport(job, getWindow);
        sendToRenderer(getWindow, IPC_CHANNELS.LONGFORM_EXPORT_COMPLETE, {
          projectId: job.projectId,
          outputPath: job.outputPath,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Long-form export failed";
        sendToRenderer(getWindow, IPC_CHANNELS.LONGFORM_EXPORT_ERROR, {
          projectId: job.projectId,
          error: message,
        });
      }
    }
  } finally {
    longformProcessing = false;
  }
}

export function parseTimelineJson(json: string): LongFormTimeline {
  const parsed = validateTimeline(JSON.parse(json) as unknown);
  if (!parsed) {
    throw new Error("Invalid timeline JSON");
  }
  return parsed;
}

export async function extractThumbnailFrame(
  ffmpegPath: string,
  videoPath: string,
  outputPath: string,
  timeSec: number
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      [
        "-y",
        "-ss",
        Math.max(0, timeSec).toFixed(3),
        "-i",
        videoPath,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        outputPath,
      ],
      { stdio: "ignore" }
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(outputPath)) resolve();
      else reject(new Error("Failed to extract thumbnail frame"));
    });
  });
}
