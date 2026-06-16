/**
 * Unit tests for the transcript chunker (electron/analysis/chunker.ts).
 *
 * The chunker is a pure function with no Electron dependency, so it is imported
 * directly. These tests verify boundary-aware splitting: clips end on sentence
 * or pause boundaries (never mid-sentence) and are sized per video type.
 */
import { describe, it, expect } from "vitest";
import { chunkTranscript } from "../../electron/analysis/chunker";

interface SimpleWord {
  start: number;
  end: number;
  word: string;
}

/** Build a transcript with evenly-spaced words; `text` words separated by spaces. */
function makeTranscript(words: SimpleWord[]) {
  return { segments: [{ start: words[0]?.start ?? 0, end: words.at(-1)?.end ?? 0, words }] };
}

/** Generate `count` words of `dur` seconds each; mark sentence ends at given indices. */
function generateWords(count: number, dur: number, sentenceEnds: Set<number>): SimpleWord[] {
  const words: SimpleWord[] = [];
  for (let i = 0; i < count; i++) {
    const start = i * dur;
    const punct = sentenceEnds.has(i) ? "." : "";
    words.push({ start, end: start + dur, word: ` w${i}${punct}` });
  }
  return words;
}

describe("chunkTranscript", () => {
  it("returns an empty array for an empty transcript", () => {
    expect(chunkTranscript({ segments: [] }, "podcast")).toEqual([]);
  });

  it("never splits mid-sentence — every chunk ends on terminal punctuation", () => {
    // 1s words, sentence ends every 10 words => sentence boundaries at 10s intervals.
    const sentenceEnds = new Set([9, 19, 29, 39, 49, 59, 69, 79, 89, 99]);
    const transcript = makeTranscript(generateWords(100, 1, sentenceEnds));

    const chunks = chunkTranscript(transcript, "podcast");

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.text.trim()).toMatch(/[.!?]$/);
    }
  });

  it("sizes podcast chunks within the 30-90s preset band", () => {
    const sentenceEnds = new Set(Array.from({ length: 100 }, (_, i) => i).filter((i) => i % 5 === 4));
    const transcript = makeTranscript(generateWords(300, 1, sentenceEnds));

    const chunks = chunkTranscript(transcript, "podcast");

    // All but possibly the final chunk should respect the min/max band.
    for (const chunk of chunks.slice(0, -1)) {
      const durSec = (chunk.endMs - chunk.startMs) / 1000;
      expect(durSec).toBeGreaterThanOrEqual(30);
      expect(durSec).toBeLessThanOrEqual(90 + 1); // +1s slack for the boundary word
    }
  });

  it("produces shorter chunks for vlog than podcast on the same transcript", () => {
    const sentenceEnds = new Set(Array.from({ length: 300 }, (_, i) => i).filter((i) => i % 5 === 4));
    const words = generateWords(300, 1, sentenceEnds);

    const podcast = chunkTranscript(makeTranscript(words), "podcast");
    const vlog = chunkTranscript(makeTranscript(words), "vlog");

    expect(vlog.length).toBeGreaterThan(podcast.length);
  });

  it("splits on a long pause even without punctuation", () => {
    // 40 words of 1s each, then a 5s silence gap, then more — vlog max is 45s.
    const words: SimpleWord[] = [];
    for (let i = 0; i < 20; i++) words.push({ start: i, end: i + 1, word: ` a${i}` });
    // big gap: next word starts at 30 (10s pause after word ending at 20)
    for (let i = 0; i < 20; i++) words.push({ start: 30 + i, end: 31 + i, word: ` b${i}` });

    const chunks = chunkTranscript(makeTranscript(words), "vlog");
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // First chunk should end before the pause (at ~20s), not span across it.
    expect(chunks[0].endMs).toBeLessThanOrEqual(21_000);
  });

  it("assigns sequential indices and ordered timestamps", () => {
    const sentenceEnds = new Set(Array.from({ length: 200 }, (_, i) => i).filter((i) => i % 5 === 4));
    const chunks = chunkTranscript(makeTranscript(generateWords(200, 1, sentenceEnds)), "podcast");

    chunks.forEach((chunk, idx) => {
      expect(chunk.index).toBe(idx);
      expect(chunk.endMs).toBeGreaterThan(chunk.startMs);
      if (idx > 0) {
        expect(chunk.startMs).toBeGreaterThanOrEqual(chunks[idx - 1].endMs - 1);
      }
    });
  });

  it("falls back to segment-level timing when word timestamps are absent", () => {
    const transcript = {
      segments: [
        { start: 0, end: 40, text: "First long segment without word timings." },
        { start: 40, end: 80, text: "Second long segment without word timings." },
      ],
    };
    const chunks = chunkTranscript(transcript, "podcast");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].text).toContain("segment");
  });
});
