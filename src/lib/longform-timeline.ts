/** Pure timeline helpers for the Long-Form Editor (source-time segments). */

export interface LongFormSegment {
  id: string;
  sourceStartMs: number;
  sourceEndMs: number;
}

export interface LongFormChapter {
  id: string;
  /** Position on the *edited* timeline (after cuts), in milliseconds. */
  startMs: number;
  title: string;
}

export interface LongFormColorSettings {
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
}

export interface LongFormAudioSettings {
  volume: number;
  noiseReduction: number;
  normalizeLufs: boolean;
}

export interface LongFormMetadata {
  title: string;
  description: string;
  tags: string;
}

export interface LongFormTimeline {
  version: 1;
  segments: LongFormSegment[];
  chapters: LongFormChapter[];
  color: LongFormColorSettings;
  audio: LongFormAudioSettings;
  metadata: LongFormMetadata;
}

export const DEFAULT_COLOR: LongFormColorSettings = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
};

export const DEFAULT_AUDIO: LongFormAudioSettings = {
  volume: 1,
  noiseReduction: 0,
  normalizeLufs: true,
};

export function createSegmentId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `seg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createDefaultTimeline(durationSec: number, title = ""): LongFormTimeline {
  const endMs = Math.max(0, Math.round(durationSec * 1000));
  return {
    version: 1,
    segments:
      endMs > 0
        ? [{ id: createSegmentId(), sourceStartMs: 0, sourceEndMs: endMs }]
        : [],
    chapters: [{ id: createSegmentId(), startMs: 0, title: "Intro" }],
    color: { ...DEFAULT_COLOR },
    audio: { ...DEFAULT_AUDIO },
    metadata: { title, description: "", tags: "" },
  };
}

export function totalDurationMs(segments: LongFormSegment[]): number {
  return segments.reduce((sum, s) => sum + Math.max(0, s.sourceEndMs - s.sourceStartMs), 0);
}

/** Map a source timestamp into edited timeline time. Returns null if source is cut. */
export function sourceToTimelineMs(
  sourceMs: number,
  segments: LongFormSegment[]
): number | null {
  let timelineMs = 0;
  for (const seg of segments) {
    if (sourceMs >= seg.sourceStartMs && sourceMs < seg.sourceEndMs) {
      return timelineMs + (sourceMs - seg.sourceStartMs);
    }
    // Inclusive end of last segment
    if (sourceMs === seg.sourceEndMs) {
      return timelineMs + (seg.sourceEndMs - seg.sourceStartMs);
    }
    timelineMs += seg.sourceEndMs - seg.sourceStartMs;
  }
  return null;
}

/** Map edited timeline time back to source time. */
export function timelineToSourceMs(
  timelineMs: number,
  segments: LongFormSegment[]
): number | null {
  let remaining = timelineMs;
  for (const seg of segments) {
    const dur = seg.sourceEndMs - seg.sourceStartMs;
    if (remaining <= dur) {
      return seg.sourceStartMs + remaining;
    }
    remaining -= dur;
  }
  if (segments.length === 0) return null;
  const last = segments[segments.length - 1];
  return last.sourceEndMs;
}

/**
 * Remove [startMs, endMs) from the source, splitting/trimming segments.
 * Chapters that fall inside deleted timeline ranges are dropped; later chapters shift.
 */
export function deleteSourceRange(
  timeline: LongFormTimeline,
  rangeStartMs: number,
  rangeEndMs: number
): LongFormTimeline {
  const start = Math.min(rangeStartMs, rangeEndMs);
  const end = Math.max(rangeStartMs, rangeEndMs);
  if (end - start < 1) return timeline;

  let deletedTimelineStart: number | null = null;
  let deletedTimelineDuration = 0;
  let cursor = 0;
  for (const seg of timeline.segments) {
    const segDur = seg.sourceEndMs - seg.sourceStartMs;
    const overlapStart = Math.max(seg.sourceStartMs, start);
    const overlapEnd = Math.min(seg.sourceEndMs, end);
    if (overlapEnd > overlapStart) {
      const localStart = overlapStart - seg.sourceStartMs;
      if (deletedTimelineStart === null) {
        deletedTimelineStart = cursor + localStart;
      }
      deletedTimelineDuration += overlapEnd - overlapStart;
    }
    cursor += segDur;
  }

  const nextSegments: LongFormSegment[] = [];
  for (const seg of timeline.segments) {
    if (seg.sourceEndMs <= start || seg.sourceStartMs >= end) {
      nextSegments.push(seg);
      continue;
    }

    // Overlaps — keep left and/or right remainders
    if (seg.sourceStartMs < start) {
      nextSegments.push({
        id: createSegmentId(),
        sourceStartMs: seg.sourceStartMs,
        sourceEndMs: start,
      });
    }
    if (seg.sourceEndMs > end) {
      nextSegments.push({
        id: createSegmentId(),
        sourceStartMs: end,
        sourceEndMs: seg.sourceEndMs,
      });
    }
  }

  const merged = mergeAdjacent(nextSegments);

  const chapters = timeline.chapters
    .map((ch) => {
      if (deletedTimelineStart === null || deletedTimelineDuration <= 0) return ch;
      if (
        ch.startMs >= deletedTimelineStart &&
        ch.startMs < deletedTimelineStart + deletedTimelineDuration
      ) {
        return null;
      }
      if (ch.startMs >= deletedTimelineStart + deletedTimelineDuration) {
        return { ...ch, startMs: Math.max(0, ch.startMs - deletedTimelineDuration) };
      }
      return ch;
    })
    .filter((ch): ch is LongFormChapter => ch !== null);

  // Ensure a 0:00 chapter exists for YouTube
  const hasZero = chapters.some((c) => c.startMs === 0);
  const nextChapters = hasZero
    ? chapters
    : [{ id: createSegmentId(), startMs: 0, title: "Intro" }, ...chapters];

  return { ...timeline, segments: merged, chapters: nextChapters };
}

function mergeAdjacent(segments: LongFormSegment[]): LongFormSegment[] {
  if (segments.length === 0) return [];
  const sorted = [...segments].sort((a, b) => a.sourceStartMs - b.sourceStartMs);
  const out: LongFormSegment[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1];
    const cur = sorted[i];
    if (cur.sourceStartMs <= prev.sourceEndMs) {
      prev.sourceEndMs = Math.max(prev.sourceEndMs, cur.sourceEndMs);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/** Split the segment that contains sourceMs (no-op if already on a boundary). */
export function splitAtSource(
  segments: LongFormSegment[],
  sourceMs: number
): LongFormSegment[] {
  const next: LongFormSegment[] = [];
  for (const seg of segments) {
    if (sourceMs > seg.sourceStartMs && sourceMs < seg.sourceEndMs) {
      next.push({
        id: createSegmentId(),
        sourceStartMs: seg.sourceStartMs,
        sourceEndMs: sourceMs,
      });
      next.push({
        id: createSegmentId(),
        sourceStartMs: sourceMs,
        sourceEndMs: seg.sourceEndMs,
      });
    } else {
      next.push(seg);
    }
  }
  return next;
}

export function validateTimeline(raw: unknown): LongFormTimeline | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Partial<LongFormTimeline>;
  if (t.version !== 1 || !Array.isArray(t.segments)) return null;
  return {
    version: 1,
    segments: t.segments.filter(
      (s) =>
        s &&
        typeof s.id === "string" &&
        typeof s.sourceStartMs === "number" &&
        typeof s.sourceEndMs === "number" &&
        s.sourceEndMs > s.sourceStartMs
    ),
    chapters: Array.isArray(t.chapters)
      ? t.chapters.filter(
          (c) =>
            c &&
            typeof c.id === "string" &&
            typeof c.startMs === "number" &&
            typeof c.title === "string"
        )
      : [{ id: createSegmentId(), startMs: 0, title: "Intro" }],
    color: { ...DEFAULT_COLOR, ...(t.color ?? {}) },
    audio: { ...DEFAULT_AUDIO, ...(t.audio ?? {}) },
    metadata: {
      title: t.metadata?.title ?? "",
      description: t.metadata?.description ?? "",
      tags: t.metadata?.tags ?? "",
    },
  };
}
