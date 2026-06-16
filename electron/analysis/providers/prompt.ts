import type { AnalysisContext, ChunkInput, ScoredChunk } from "./types";

/**
 * Shared prompt construction and response parsing for all providers, so Gemini
 * and Ollama score identically and only differ in transport.
 */

const VIDEO_TYPE_LABEL: Record<string, string> = {
  podcast: "Podcast / Livestream (talking-head, dialogue-driven)",
  vlog: "Vlog / Short-form (fast-paced, visually dynamic)",
};

export function buildSystemPrompt(ctx: AnalysisContext): string {
  return [
    "You are an expert content editor who identifies viral short-form video clips for YouTube Shorts and TikTok.",
    "",
    "USER'S CREATIVE BRIEF:",
    `"${ctx.creativeBrief || "Find the most engaging, viral-worthy moments."}"`,
    "",
    "VIDEO TYPE:",
    VIDEO_TYPE_LABEL[ctx.videoType] ?? ctx.videoType,
    "",
    "For EACH segment provided, score it 1-10 on:",
    "- hook_strength: does it grab attention in the first 3 seconds?",
    "- brief_relevance: how well does it match the creative brief?",
    "- self_containment: does it make sense without prior context?",
    "- emotional_arc: surprise, humor, tension, or excitement?",
    "- platform_fit: is the pacing right for Shorts/TikTok?",
    "",
    "Also write a catchy 5-7 word title, a 1-2 sentence description, an overall score (0-10), and brief reasoning.",
    "Return ONE result per input segment. Echo each segment's `index` exactly so results can be matched.",
    "Respond with JSON only, no prose, matching the requested schema.",
  ].join("\n");
}

/** Compact, index-tagged transcript payload for the text pass. */
export function buildChunksText(chunks: ChunkInput[]): string {
  return chunks
    .map(
      (c) =>
        `--- SEGMENT index=${c.index} (${c.startSec.toFixed(1)}s-${c.endSec.toFixed(1)}s) ---\n${c.text}`
    )
    .join("\n\n");
}

/** JSON Schema describing the expected response array (used by Gemini responseSchema). */
export const RESPONSE_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      index: { type: "integer" },
      title: { type: "string" },
      description: { type: "string" },
      hook_strength: { type: "number" },
      brief_relevance: { type: "number" },
      self_containment: { type: "number" },
      emotional_arc: { type: "number" },
      platform_fit: { type: "number" },
      overall_score: { type: "number" },
      reasoning: { type: "string" },
    },
    required: [
      "index",
      "title",
      "description",
      "hook_strength",
      "brief_relevance",
      "self_containment",
      "emotional_arc",
      "platform_fit",
      "overall_score",
      "reasoning",
    ],
  },
} as const;

function clamp(n: unknown, lo: number, hi: number, fallback = 0): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.min(hi, Math.max(lo, v));
}

/** Strip markdown code fences some models wrap JSON in, then parse. */
function extractJson(raw: string): unknown {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  // Some models emit an object wrapping the array, e.g. { "results": [...] }.
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const firstArray = Object.values(parsed).find((v) => Array.isArray(v));
    if (firstArray) return firstArray;
  }
  return parsed;
}

/**
 * Parse and normalize a raw model response into ScoredChunk[]. Tolerant of
 * markdown fences, wrapper objects, and out-of-range numbers; invalid entries
 * are dropped rather than throwing.
 */
export function parseScoredResponse(raw: string): ScoredChunk[] {
  const data = extractJson(raw);
  if (!Array.isArray(data)) {
    throw new Error("AI response was not a JSON array of scored segments.");
  }

  const results: ScoredChunk[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.index !== "number") continue;

    results.push({
      index: o.index,
      title: typeof o.title === "string" ? o.title : "Untitled clip",
      description: typeof o.description === "string" ? o.description : "",
      scores: {
        hook_strength: clamp(o.hook_strength, 0, 10),
        brief_relevance: clamp(o.brief_relevance, 0, 10),
        self_containment: clamp(o.self_containment, 0, 10),
        emotional_arc: clamp(o.emotional_arc, 0, 10),
        platform_fit: clamp(o.platform_fit, 0, 10),
      },
      overall: clamp(o.overall_score, 0, 10),
      reasoning: typeof o.reasoning === "string" ? o.reasoning : "",
    });
  }
  return results;
}
