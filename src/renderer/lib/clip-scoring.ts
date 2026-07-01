import type { Clip } from "@/types/electron";

export interface ScoreCriterion {
  key: keyof Clip;
  label: string;
  description: string;
}

/** AI scoring dimensions — descriptions match the analysis prompt. */
export const SCORE_CRITERIA: ScoreCriterion[] = [
  {
    key: "hook_strength",
    label: "Hook",
    description: "Does the first 3 seconds grab attention?",
  },
  {
    key: "brief_relevance",
    label: "Fit",
    description:
      "How well this clip matches what you asked for — the clip types you described before running analysis.",
  },
  {
    key: "self_containment",
    label: "Standalone",
    description: "Does it make sense without prior context?",
  },
  {
    key: "emotional_arc",
    label: "Emotion",
    description: "Surprise, humor, tension, or excitement.",
  },
  {
    key: "platform_fit",
    label: "Platform",
    description: "Is the pacing right for Shorts and TikTok?",
  },
];

function safe(val: number | null | undefined): number {
  return val ?? 0;
}

export function computeCompositeScore(clip: Clip): number {
  const ai = safe(clip.ai_score);
  const brief = safe(clip.brief_relevance);
  const hook = safe(clip.hook_strength);
  const emotion = safe(clip.emotional_arc);
  const platform = safe(clip.platform_fit);
  return 0.4 * ai + 0.3 * brief + 0.1 * hook + 0.1 * emotion + 0.1 * platform;
}

export function sortByComposite(clips: Clip[]): Clip[] {
  return [...clips].sort((a, b) => computeCompositeScore(b) - computeCompositeScore(a));
}
