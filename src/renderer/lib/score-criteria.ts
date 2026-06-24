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
