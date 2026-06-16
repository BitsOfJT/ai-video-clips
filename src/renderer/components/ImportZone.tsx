import { useCallback, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/renderer/lib/utils";
import { useAppStore } from "@/renderer/store/useAppStore";
import { SUPPORTED_VIDEO_EXTENSIONS } from "@/constants";

export default function ImportZone() {
  const [isDragging, setIsDragging] = useState(false);
  const importProject = useAppStore((state) => state.importProject);
  const isImporting = useAppStore((state) => state.isImporting);
  const importError = useAppStore((state) => state.importError);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);

      const files = Array.from(event.dataTransfer.files);
      const videoFiles = files.filter((file) =>
        SUPPORTED_VIDEO_EXTENSIONS.some((ext) =>
          file.path.toLowerCase().endsWith(ext)
        )
      );

      for (const file of videoFiles) {
        await importProject(file.path);
      }
    },
    [importProject]
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center transition-colors",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:border-muted-foreground"
      )}
    >
      <div className="mb-4 rounded-full bg-secondary p-4">
        <Upload className="h-8 w-8 text-secondary-foreground" />
      </div>

      <h3 className="mb-2 text-lg font-semibold">
        Drop your video here
      </h3>

      <p className="mb-4 max-w-sm text-sm text-muted-foreground">
        Drag and drop a video file to import it. Supported formats:{" "}
        {SUPPORTED_VIDEO_EXTENSIONS.join(", ")}.
      </p>

      {isImporting && (
        <p className="text-sm text-muted-foreground">Importing video...</p>
      )}

      {importError && (
        <p className="mt-2 text-sm text-destructive">{importError}</p>
      )}
    </div>
  );
}
