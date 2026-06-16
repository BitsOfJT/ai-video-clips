import { CHUNK_PRESETS } from "../../src/constants";
import type { VideoType } from "../../src/types/electron";

/** A single timestamped word, flattened from the transcript. */
interface Word {
  start: number; // seconds
  end: number; // seconds
  word: string;
}

/** A candidate clip segment produced by the chunker. */
export interface Chunk {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

/** Minimal shape of the transcript JSON written by python/transcriber.py. */
interface TranscriptLike {
  segments?: Array<{
    start?: number;
    end?: number;
    text?: string;
    words?: Array<{ start?: number | null; end?: number | null; word?: string }>;
  }>;
}

/** True when a word ends a sentence (terminal punctuation, optional trailing quote/bracket). */
function endsSentence(word: string): boolean {
  return /[.!?]["'”’)\]]?\s*$/.test(word);
}

/** Flatten all word-level timestamps in transcript order. Falls back to segment-level timing. */
function flattenWords(transcript: TranscriptLike): Word[] {
  const words: Word[] = [];

  for (const segment of transcript.segments ?? []) {
    for (const w of segment.words ?? []) {
      if (typeof w.start === "number" && typeof w.end === "number" && w.word) {
        words.push({ start: w.start, end: w.end, word: w.word });
      }
    }
  }

  // Fallback: no word-level timestamps — chunk on whole segments instead.
  if (words.length === 0) {
    for (const segment of transcript.segments ?? []) {
      if (typeof segment.start === "number" && typeof segment.end === "number" && segment.text) {
        words.push({ start: segment.start, end: segment.end, word: segment.text });
      }
    }
  }

  return words.sort((a, b) => a.start - b.start);
}

function buildChunk(words: Word[], startIdx: number, endIdx: number, index: number): Chunk {
  const text = words
    .slice(startIdx, endIdx + 1)
    .map((w) => w.word)
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  return {
    index,
    startMs: Math.round(words[startIdx].start * 1000),
    endMs: Math.round(words[endIdx].end * 1000),
    text,
  };
}

/**
 * Split a transcript into candidate clip chunks on sentence/pause boundaries so
 * clips never cut mid-sentence. Each chunk grows until it reaches `maxSec`, then
 * closes at the latest sentence-end or pause (>= `pauseGapSec`) that occurred
 * past `minSec`. Sizing is driven by video type (see CHUNK_PRESETS).
 */
export function chunkTranscript(transcript: TranscriptLike, videoType: VideoType): Chunk[] {
  const preset = CHUNK_PRESETS[videoType];
  const words = flattenWords(transcript);
  const chunks: Chunk[] = [];

  let i = 0;
  const n = words.length;

  while (i < n) {
    const chunkStart = words[i].start;
    let lastBoundary = -1; // furthest word index (inclusive) that is a clean cut within [min, max]
    let j = i;

    while (j < n) {
      const w = words[j];
      const dur = w.end - chunkStart;
      const gapToNext = j + 1 < n ? words[j + 1].start - w.end : Number.POSITIVE_INFINITY;
      const isBoundary = endsSentence(w.word) || gapToNext >= preset.pauseGapSec;

      if (dur >= preset.minSec && isBoundary) {
        lastBoundary = j;
      }
      if (dur >= preset.maxSec) {
        break;
      }
      j++;
    }

    // Prefer a clean boundary; otherwise take what we have (hard cap or end of transcript).
    const endIdx = lastBoundary >= 0 ? lastBoundary : Math.min(j, n - 1);
    chunks.push(buildChunk(words, i, endIdx, chunks.length));
    i = endIdx + 1;
  }

  // Merge a too-short trailing chunk into its predecessor for a cleaner final clip.
  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1];
    if ((last.endMs - last.startMs) / 1000 < preset.minSec) {
      const prev = chunks[chunks.length - 2];
      chunks.pop();
      chunks[chunks.length - 1] = {
        index: prev.index,
        startMs: prev.startMs,
        endMs: last.endMs,
        text: `${prev.text} ${last.text}`.trim(),
      };
    }
  }

  return chunks;
}
