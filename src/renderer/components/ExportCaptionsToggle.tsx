import { useAppStore } from "@/renderer/store/useAppStore";

export default function ExportCaptionsToggle() {
  const includeCaptions = useAppStore((state) => state.exportIncludeCaptions);
  const setExportIncludeCaptions = useAppStore((state) => state.setExportIncludeCaptions);

  return (
    <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground">
      <input
        type="checkbox"
        checked={includeCaptions}
        onChange={(e) => setExportIncludeCaptions(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-border accent-primary"
      />
      Include karaoke captions
    </label>
  );
}
