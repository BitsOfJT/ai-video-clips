import { VISION_SHORTLIST_SIZE } from "../../src/constants";
import type { AnalysisStatus, ClipScores, VideoType } from "../../src/types/electron";
import { chunkTranscript, type Chunk } from "./chunker";
import { extractKeyframes } from "./keyframes";
import type { AnalysisProvider, ChunkInput, ScoredChunk, VisionChunkInput } from "./providers/types";

/** Final, persistence-ready evaluation of one candidate clip. */
export interface AnalyzedClip {
  startMs: number;
  endMs: number;
  title: string;
  description: string;
  scores: ClipScores;
  overall: number;
  reasoning: string;
}

export interface AnalyzeOptions {
  provider: AnalysisProvider;
  /** Parsed transcript JSON (the object stored in projects.transcript_json). */
  transcript: unknown;
  videoPath: string;
  creativeBrief: string;
  videoType: VideoType;
  shortlistSize?: number;
  framesPerClip?: number;
  /** Reports coarse progress so the renderer can show a live bar. */
  onProgress?: (stage: AnalysisStatus, percent: number) => void;
}

function toChunkInput(chunk: Chunk): ChunkInput {
  return {
    index: chunk.index,
    text: chunk.text,
    startSec: chunk.startMs / 1000,
    endSec: chunk.endMs / 1000,
  };
}

function byIndex(scored: ScoredChunk[]): Map<number, ScoredChunk> {
  const map = new Map<number, ScoredChunk>();
  for (const s of scored) map.set(s.index, s);
  return map;
}

/**
 * Two-pass AI analysis:
 *   1. Batched text scoring of every chunk (one request) -> shortlist top N.
 *   2. Vision refinement of the shortlist using extracted keyframes.
 * Returns all text-scored clips (vision-refined where available), sorted by
 * overall score descending. Vision failure degrades gracefully to text scores.
 */
export async function analyzeProject(opts: AnalyzeOptions): Promise<AnalyzedClip[]> {
  const {
    provider,
    transcript,
    videoPath,
    creativeBrief,
    videoType,
    shortlistSize = VISION_SHORTLIST_SIZE,
    framesPerClip = 3,
    onProgress,
  } = opts;

  const ctx = { creativeBrief, videoType };

  onProgress?.("chunking", 2);
  const chunks = chunkTranscript(transcript as never, videoType);
  if (chunks.length === 0) return [];
  const chunkByIndex = new Map(chunks.map((c) => [c.index, c]));

  // --- Pass 1: batched text scoring ---
  onProgress?.("scoring", 10);
  const textScored = await provider.scoreChunksText(chunks.map(toChunkInput), ctx);
  const textByIndex = byIndex(textScored);
  onProgress?.("scoring", 50);

  // Shortlist the highest-scoring chunks for the vision pass.
  const shortlist = [...textScored]
    .sort((a, b) => b.overall - a.overall)
    .slice(0, shortlistSize)
    .map((s) => chunkByIndex.get(s.index))
    .filter((c): c is Chunk => c !== undefined);

  // --- Pass 2: vision refinement (best-effort) ---
  let visionByIndex = new Map<number, ScoredChunk>();
  if (shortlist.length > 0) {
    onProgress?.("refining", 55);
    const visionInputs: VisionChunkInput[] = [];
    for (let i = 0; i < shortlist.length; i++) {
      const chunk = shortlist[i];
      const keyframes = await extractKeyframes(videoPath, chunk.startMs, chunk.endMs, framesPerClip);
      visionInputs.push({ ...toChunkInput(chunk), keyframes });
      onProgress?.("refining", 55 + Math.round(((i + 1) / shortlist.length) * 30));
    }

    // Only send chunks that actually yielded frames.
    const withFrames = visionInputs.filter((v) => v.keyframes.length > 0);
    if (withFrames.length > 0) {
      try {
        visionByIndex = byIndex(await provider.scoreChunksVision(withFrames, ctx));
      } catch (err) {
        // Vision is an enhancement; fall back to text-only scores on failure.
        console.warn("Vision refinement failed, using text scores:", (err as Error).message);
      }
    }
    onProgress?.("refining", 90);
  }

  // --- Merge: prefer vision results where present ---
  const clips: AnalyzedClip[] = [];
  for (const chunk of chunks) {
    const scored = visionByIndex.get(chunk.index) ?? textByIndex.get(chunk.index);
    if (!scored) continue;
    clips.push({
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      title: scored.title,
      description: scored.description,
      scores: scored.scores,
      overall: scored.overall,
      reasoning: scored.reasoning,
    });
  }

  clips.sort((a, b) => b.overall - a.overall);
  onProgress?.("completed", 100);
  return clips;
}
