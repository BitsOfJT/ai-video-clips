import path from "node:path";
import { writeFile } from "node:fs/promises";
import { app } from "electron";
import type Database from "better-sqlite3";
import type { Clip, Project } from "../src/types/electron";
import { uniqueMp4Filename } from "../src/lib/export-paths";

export async function buildWordsJsonPath(
  clipId: string,
  clip: Clip,
  project: Project
): Promise<string | null> {
  if (!project.transcript_json) return null;

  try {
    const transcript = JSON.parse(project.transcript_json) as {
      segments?: Array<{ words?: Array<Record<string, unknown>> }>;
    };
    const words: Array<Record<string, unknown>> = [];
    if (transcript.segments) {
      for (const seg of transcript.segments) {
        if (seg.words) {
          for (const w of seg.words) {
            const wStartMs = (w.start as number) * 1000;
            const wEndMs = (w.end as number) * 1000;
            if (wEndMs > (clip.start_ms ?? 0) && wStartMs < (clip.end_ms ?? 0)) {
              words.push(w);
            }
          }
        }
      }
    }
    if (words.length === 0) return null;

    const wordsJsonPath = path.join(app.getPath("userData"), `words-${clipId}.json`);
    await writeFile(wordsJsonPath, JSON.stringify(words));
    return wordsJsonPath;
  } catch (err) {
    console.error("Failed to extract words for subtitles:", err);
    return null;
  }
}

export interface ExportJobInput {
  clipId: string;
  outputPath: string;
  videoPath: string;
  startMs: number;
  endMs: number;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  wordsJsonPath: string | null;
}

export function createExportJobFromClip(
  clip: Clip,
  resolvedVideoPath: string,
  outputPath: string,
  wordsJsonPath: string | null
): ExportJobInput {
  return {
    clipId: clip.id,
    outputPath,
    videoPath: resolvedVideoPath,
    startMs: clip.start_ms ?? 0,
    endMs: clip.end_ms ?? 0,
    cropX: clip.crop_x ?? -1,
    cropY: clip.crop_y ?? -1,
    cropW: clip.crop_w ?? -1,
    cropH: clip.crop_h ?? -1,
    wordsJsonPath,
  };
}

export function buildBatchOutputPaths(folder: string, clips: Clip[]): Map<string, string> {
  const usedNames = new Set<string>();
  const paths = new Map<string, string>();
  for (const clip of clips) {
    const filename = uniqueMp4Filename(clip.title || "clip", usedNames);
    paths.set(clip.id, path.join(folder, filename));
  }
  return paths;
}

export function markClipQueued(database: Database.Database, clipId: string): void {
  database.prepare("UPDATE clips SET status = 'queued' WHERE id = ?").run(clipId);
}
