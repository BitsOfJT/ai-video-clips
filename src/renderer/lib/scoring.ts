import type { Clip } from "@/types/electron";

function safe(val: number | null | undefined): number {
  return val ?? 0;
}

export function computeCompositeScore(clip: Clip): number {
  const ai = safe(clip.ai_score);
  const brief = safe(clip.brief_relevance);
  const hook = safe(clip.hook_strength);
  const emotion = safe(clip.emotional_arc);
  const platform = safe(clip.platform_fit);
  return 0.40 * ai + 0.30 * brief + 0.10 * hook + 0.10 * emotion + 0.10 * platform;
}

export function sortByComposite(clips: Clip[]): Clip[] {
  return [...clips].sort((a, b) => computeCompositeScore(b) - computeCompositeScore(a));
}
