import { Textarea } from "@/renderer/components/ui/textarea";
import { Button } from "@/renderer/components/ui/button";
import { Label } from "@/renderer/components/ui/label";

interface CreativeBriefInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** Quick-select genre presets that seed the brief with a starting description. */
const PRESETS: Array<{ label: string; brief: string }> = [
  { label: "Gaming", brief: "High-intensity gameplay, clutch plays, and big-win moments." },
  { label: "Podcast", brief: "Insightful takes, hot takes, and funny back-and-forth exchanges." },
  { label: "Comedy", brief: "Funny reactions, punchlines, and laugh-out-loud moments." },
  { label: "Education", brief: "Clear tips, surprising facts, and actionable advice." },
  { label: "Vlog", brief: "Emotional beats, beautiful moments, and story highlights." },
];

/**
 * Freeform creative-brief textarea plus genre preset buttons. The brief is
 * injected into the AI prompt so clips are scored against the user's intent.
 */
export default function CreativeBriefInput({ value, onChange, disabled }: CreativeBriefInputProps) {
  return (
    <div className="space-y-3">
      <Label htmlFor="creative-brief">What kind of clips are you looking for?</Label>
      <Textarea
        id="creative-brief"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={3}
        placeholder='e.g. "Funny reaction moments" or "High-intensity action and clutch plays"'
      />
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(preset.brief)}
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
