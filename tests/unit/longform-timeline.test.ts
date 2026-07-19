import { describe, expect, it } from "vitest";
import {
  createDefaultTimeline,
  deleteSourceRange,
  sourceToTimelineMs,
  splitAtSource,
  timelineToSourceMs,
  totalDurationMs,
  validateTimeline,
} from "@/lib/longform-timeline";
import { findFillerRanges, findSilenceRanges } from "@/renderer/lib/longform-fillers";
import { buildSrtFromTranscript, formatYoutubeChapters } from "@/renderer/lib/longform-captions";
import type { TranscriptSegment } from "@/types/electron";

describe("longform-timeline", () => {
  it("creates a full-duration default timeline with Intro chapter", () => {
    const t = createDefaultTimeline(10, "Demo");
    expect(t.segments).toHaveLength(1);
    expect(t.segments[0].sourceStartMs).toBe(0);
    expect(t.segments[0].sourceEndMs).toBe(10000);
    expect(t.chapters[0].startMs).toBe(0);
    expect(t.metadata.title).toBe("Demo");
  });

  it("maps source ↔ timeline time after a mid cut", () => {
    let t = createDefaultTimeline(10);
    t = deleteSourceRange(t, 2000, 4000);
    expect(totalDurationMs(t.segments)).toBe(8000);
    expect(sourceToTimelineMs(1000, t.segments)).toBe(1000);
    expect(sourceToTimelineMs(3000, t.segments)).toBeNull();
    expect(sourceToTimelineMs(5000, t.segments)).toBe(3000);
    expect(timelineToSourceMs(3000, t.segments)).toBe(5000);
  });

  it("ripple-deletes and shifts chapters after the cut", () => {
    let t = createDefaultTimeline(20);
    t = {
      ...t,
      chapters: [
        { id: "a", startMs: 0, title: "Intro" },
        { id: "b", startMs: 5000, title: "Middle" },
        { id: "c", startMs: 15000, title: "End" },
      ],
    };
    t = deleteSourceRange(t, 4000, 6000);
    expect(t.chapters.find((c) => c.id === "b")).toBeUndefined();
    const end = t.chapters.find((c) => c.id === "c");
    expect(end?.startMs).toBe(13000);
  });

  it("splits a segment at the playhead", () => {
    const t = createDefaultTimeline(10);
    const segments = splitAtSource(t.segments, 3500);
    expect(segments).toHaveLength(2);
    expect(segments[0].sourceEndMs).toBe(3500);
    expect(segments[1].sourceStartMs).toBe(3500);
  });

  it("validates timeline JSON shape", () => {
    expect(validateTimeline(null)).toBeNull();
    expect(validateTimeline({ version: 1, segments: [] })?.version).toBe(1);
  });
});

describe("longform-fillers", () => {
  const segments: TranscriptSegment[] = [
    {
      id: 1,
      start: 0,
      end: 5,
      text: "um hello there",
      words: [
        { start: 0.2, end: 0.4, word: "um", probability: 0.9 },
        { start: 0.5, end: 0.9, word: "hello", probability: 0.9 },
        { start: 1.0, end: 1.4, word: "there", probability: 0.9 },
        { start: 3.5, end: 4.0, word: "again", probability: 0.9 },
      ],
    },
  ];

  it("detects filler words", () => {
    const ranges = findFillerRanges(segments);
    expect(ranges.length).toBeGreaterThanOrEqual(1);
    expect(ranges[0].startMs).toBe(200);
  });

  it("detects silence gaps above threshold", () => {
    const ranges = findSilenceRanges(segments, 1);
    expect(ranges.some((r) => r.startMs === 1400 && r.endMs === 3500)).toBe(true);
  });
});

describe("longform-captions", () => {
  it("formats YouTube chapters starting at 0:00", () => {
    const text = formatYoutubeChapters([
      { id: "1", startMs: 0, title: "Intro" },
      { id: "2", startMs: 65000, title: "Tips" },
    ]);
    expect(text).toContain("0:00 Intro");
    expect(text).toContain("1:05 Tips");
  });

  it("builds SRT remapped onto edited timeline", () => {
    const segments: TranscriptSegment[] = [
      {
        id: 1,
        start: 0,
        end: 2,
        text: "hello world",
        words: [
          { start: 0, end: 0.5, word: "hello", probability: 1 },
          { start: 0.6, end: 1.0, word: "world", probability: 1 },
        ],
      },
    ];
    const timeline = createDefaultTimeline(5);
    const srt = buildSrtFromTranscript(segments, timeline.segments, 8);
    expect(srt).toContain("hello world");
    expect(srt).toContain("-->");
  });
});
