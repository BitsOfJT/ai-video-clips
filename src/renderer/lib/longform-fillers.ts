import type { TranscriptSegment, TranscriptWord } from "@/types/electron";

const FILLER_WORDS = new Set([
  "um",
  "uh",
  "uhm",
  "erm",
  "ah",
  "eh",
  "like",
  "you know",
  "i mean",
  "sort of",
  "kind of",
]);

export interface TimedRange {
  startMs: number;
  endMs: number;
  label?: string;
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, "").trim();
}

export function flattenWords(segments: TranscriptSegment[]): TranscriptWord[] {
  const words: TranscriptWord[] = [];
  for (const seg of segments) {
    for (const w of seg.words ?? []) {
      if (typeof w.start === "number" && typeof w.end === "number" && w.word) {
        words.push(w);
      }
    }
  }
  return words.sort((a, b) => a.start - b.start);
}

/** Find filler-word ranges in source seconds → ms. */
export function findFillerRanges(segments: TranscriptSegment[]): TimedRange[] {
  const words = flattenWords(segments);
  const ranges: TimedRange[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const norm = normalizeWord(w.word);
    if (FILLER_WORDS.has(norm)) {
      ranges.push({
        startMs: Math.round(w.start * 1000),
        endMs: Math.round(w.end * 1000),
        label: w.word,
      });
      continue;
    }

    // Two-word fillers: "you know", "i mean", "sort of", "kind of"
    if (i + 1 < words.length) {
      const pair = `${norm} ${normalizeWord(words[i + 1].word)}`;
      if (FILLER_WORDS.has(pair)) {
        ranges.push({
          startMs: Math.round(w.start * 1000),
          endMs: Math.round(words[i + 1].end * 1000),
          label: `${w.word} ${words[i + 1].word}`,
        });
        i += 1;
      }
    }
  }

  return mergeCloseRanges(ranges, 50);
}

/** Find silence gaps between consecutive words longer than thresholdSec. */
export function findSilenceRanges(
  segments: TranscriptSegment[],
  thresholdSec: number,
  mediaDurationSec?: number
): TimedRange[] {
  const words = flattenWords(segments);
  if (words.length === 0) return [];

  const ranges: TimedRange[] = [];
  const thresholdMs = Math.round(thresholdSec * 1000);

  // Leading silence
  const firstStartMs = Math.round(words[0].start * 1000);
  if (firstStartMs >= thresholdMs) {
    ranges.push({ startMs: 0, endMs: firstStartMs, label: "silence" });
  }

  for (let i = 0; i < words.length - 1; i++) {
    const gapStartMs = Math.round(words[i].end * 1000);
    const gapEndMs = Math.round(words[i + 1].start * 1000);
    if (gapEndMs - gapStartMs >= thresholdMs) {
      ranges.push({ startMs: gapStartMs, endMs: gapEndMs, label: "silence" });
    }
  }

  // Trailing silence
  if (typeof mediaDurationSec === "number" && mediaDurationSec > 0) {
    const lastEndMs = Math.round(words[words.length - 1].end * 1000);
    const mediaEndMs = Math.round(mediaDurationSec * 1000);
    if (mediaEndMs - lastEndMs >= thresholdMs) {
      ranges.push({ startMs: lastEndMs, endMs: mediaEndMs, label: "silence" });
    }
  }

  return ranges;
}

function mergeCloseRanges(ranges: TimedRange[], gapMs: number): TimedRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.startMs - b.startMs);
  const out: TimedRange[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1];
    const cur = sorted[i];
    if (cur.startMs <= prev.endMs + gapMs) {
      prev.endMs = Math.max(prev.endMs, cur.endMs);
      if (cur.label && prev.label && !prev.label.includes(cur.label)) {
        prev.label = `${prev.label}, ${cur.label}`;
      }
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/** Apply multiple source-range deletes from last → first so earlier indices stay valid. */
export function sortRangesDescending(ranges: TimedRange[]): TimedRange[] {
  return [...ranges].sort((a, b) => b.startMs - a.startMs);
}
