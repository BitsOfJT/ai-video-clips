import type { LongFormChapter } from "@/lib/longform-timeline";
import type { TranscriptSegment } from "@/types/electron";
import { flattenWords } from "@/renderer/lib/longform-fillers";
import {
  sourceToTimelineMs,
  type LongFormSegment,
} from "@/lib/longform-timeline";

/** Format milliseconds as YouTube chapter timestamp (H:MM:SS or M:SS). */
export function formatChapterTimestamp(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Build a YouTube description chapter block.
 * YouTube requires first timestamp at 0:00 and ≥3 chapters of ≥10s each to activate.
 */
export function formatYoutubeChapters(chapters: LongFormChapter[]): string {
  const sorted = [...chapters].sort((a, b) => a.startMs - b.startMs);
  const lines = sorted.map((c) => `${formatChapterTimestamp(c.startMs)} ${c.title.trim() || "Chapter"}`);
  return lines.join("\n");
}

function formatSrtTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3600000);
  const m = Math.floor((clamped % 3600000) / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  const frac = clamped % 1000;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s
    .toString()
    .padStart(2, "0")},${frac.toString().padStart(3, "0")}`;
}

/**
 * Build an SRT string from transcript words, remapped onto the edited timeline.
 * Groups ~8 words per cue for readable long-form captions.
 */
export function buildSrtFromTranscript(
  segments: TranscriptSegment[],
  editSegments: LongFormSegment[],
  wordsPerCue = 8
): string {
  const words = flattenWords(segments);
  const cues: Array<{ startMs: number; endMs: number; text: string }> = [];
  let buffer: Array<{ timelineStart: number; timelineEnd: number; word: string }> = [];

  const flush = () => {
    if (buffer.length === 0) return;
    cues.push({
      startMs: buffer[0].timelineStart,
      endMs: buffer[buffer.length - 1].timelineEnd,
      text: buffer.map((b) => b.word).join(" ").replace(/\s+/g, " ").trim(),
    });
    buffer = [];
  };

  for (const w of words) {
    const startMs = Math.round(w.start * 1000);
    const endMs = Math.round(w.end * 1000);
    const tlStart = sourceToTimelineMs(startMs, editSegments);
    const tlEnd = sourceToTimelineMs(Math.max(startMs, endMs - 1), editSegments);
    if (tlStart === null || tlEnd === null) {
      flush();
      continue;
    }
    buffer.push({
      timelineStart: tlStart,
      timelineEnd: Math.max(tlStart + 1, tlEnd + (endMs - startMs > 0 ? endMs - startMs : 200)),
      word: w.word,
    });
    if (buffer.length >= wordsPerCue) flush();
  }
  flush();

  return cues
    .filter((c) => c.text.length > 0 && c.endMs > c.startMs)
    .map(
      (c, i) =>
        `${i + 1}\n${formatSrtTimestamp(c.startMs)} --> ${formatSrtTimestamp(c.endMs)}\n${c.text}\n`
    )
    .join("\n");
}
