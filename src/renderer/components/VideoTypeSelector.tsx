import { Mic, Clapperboard } from "lucide-react";
import { cn } from "@/renderer/lib/utils";
import { Label } from "@/renderer/components/ui/label";
import type { VideoType } from "@/types/electron";

interface VideoTypeSelectorProps {
  value: VideoType;
  onChange: (value: VideoType) => void;
  disabled?: boolean;
}

const OPTIONS: Array<{ value: VideoType; title: string; description: string; icon: typeof Mic }> = [
  {
    value: "podcast",
    title: "Podcast / Livestream",
    description: "Longer chunks, coherent dialogue arcs.",
    icon: Mic,
  },
  {
    value: "vlog",
    title: "Vlog / Short-form",
    description: "Shorter chunks, fast-paced moments.",
    icon: Clapperboard,
  },
];

/**
 * Content-type toggle that drives the chunking strategy (chunk length and
 * pause sensitivity) used during analysis.
 */
export default function VideoTypeSelector({ value, onChange, disabled }: VideoTypeSelectorProps) {
  return (
    <div className="space-y-3">
      <Label>Video type</Label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                "hover:border-primary disabled:cursor-not-allowed disabled:opacity-50",
                selected ? "border-primary bg-accent" : "border-border"
              )}
            >
              <Icon className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <div className="text-sm font-medium">{option.title}</div>
                <div className="text-xs text-muted-foreground">{option.description}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
