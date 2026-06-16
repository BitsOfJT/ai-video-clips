import type { ClipScores, VideoType } from "../../../src/types/electron";

/** One chunk's transcript, passed to the text-scoring pass. */
export interface ChunkInput {
  index: number; // matches Chunk.index from the chunker
  text: string;
  startSec: number;
  endSec: number;
}

/** A chunk plus extracted keyframes (base64 JPEG, no data: prefix) for the vision pass. */
export interface VisionChunkInput extends ChunkInput {
  keyframes: string[];
}

/** The user's intent, injected into every prompt. */
export interface AnalysisContext {
  creativeBrief: string;
  videoType: VideoType;
}

/** A model's evaluation of a single chunk. `index` ties it back to the source chunk. */
export interface ScoredChunk {
  index: number;
  title: string;
  description: string;
  scores: ClipScores;
  overall: number; // 0-10 composite from the model
  reasoning: string;
}

/**
 * Pluggable AI backend. Implementations: Gemini (free tier, API key) and Ollama
 * (local/offline). Adding another provider only requires implementing this.
 */
export interface AnalysisProvider {
  readonly name: string;
  /** Batched text-only scoring of all candidate chunks (cheap, one request where possible). */
  scoreChunksText(chunks: ChunkInput[], ctx: AnalysisContext): Promise<ScoredChunk[]>;
  /** Vision refinement of the shortlisted chunks using extracted keyframes. */
  scoreChunksVision(chunks: VisionChunkInput[], ctx: AnalysisContext): Promise<ScoredChunk[]>;
}
