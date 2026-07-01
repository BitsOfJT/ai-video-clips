import { useCallback, useRef, useState } from "react";
import { Loader2, Upload, Video } from "lucide-react";
import { cn } from "@/renderer/lib/utils";
import { useAppStore } from "@/renderer/store/useAppStore";
import { IPC_CHANNELS, SUPPORTED_VIDEO_EXTENSIONS } from "@/constants";

function isSupportedVideo(filePath: string): boolean {
  const lowerPath = filePath.toLowerCase();
  return SUPPORTED_VIDEO_EXTENSIONS.some((ext) => lowerPath.endsWith(ext));
}

const ACCEPT_FILTER = SUPPORTED_VIDEO_EXTENSIONS.join(",");

const MISSING_PATH_ERROR =
  "Drag and drop couldn't read the file path. Please use the click-to-import button or ensure the app has Full Disk Access.";

interface ImportZoneProps {
  variant?: "hero" | "compact";
}

export default function ImportZone({ variant = "hero" }: ImportZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const importProject = useAppStore((state) => state.importProject);
  const isImporting = useAppStore((state) => state.isImporting);
  const importError = useAppStore((state) => state.importError);

  const isCompact = variant === "compact";

  const importVideoFile = useCallback(
    async (filePath: string) => {
      if (!isSupportedVideo(filePath)) {
        setSelectionError(
          `Unsupported format. Please use ${SUPPORTED_VIDEO_EXTENSIONS.join(", ")}.`
        );
        return;
      }
      setSelectionError(null);
      await importProject(filePath);
    },
    [importProject]
  );

  const handleDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const resolveDroppedPaths = useCallback(async (event: React.DragEvent): Promise<string[]> => {
    const candidates: string[] = [];
    const items = event.dataTransfer.items ? Array.from(event.dataTransfer.items) : [];

    for (const item of items) {
      if (item.kind !== "file") continue;

      if (typeof item.getAsFileSystemHandle === "function") {
        try {
          const handle = await item.getAsFileSystemHandle();
          if (handle?.kind === "file") {
            const fileHandle = handle as FileSystemFileHandle;
            const file = await fileHandle.getFile();
            const pathFromFile = (file as File & { path?: string }).path;
            if (pathFromFile) candidates.push(pathFromFile);
          }
        } catch {
          // Fall through to legacy strategies.
        }
      }

      const file = item.getAsFile();
      if (file) {
        const pathFromFile = (file as File & { path?: string }).path;
        if (pathFromFile) candidates.push(pathFromFile);
      }
    }

    for (const file of Array.from(event.dataTransfer.files ?? [])) {
      const pathFromFile = (file as File & { path?: string }).path;
      if (pathFromFile && !candidates.includes(pathFromFile)) {
        candidates.push(pathFromFile);
      }
    }

    return candidates;
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = 0;
      setIsDragging(false);
      setSelectionError(null);

      const paths = await resolveDroppedPaths(event);
      const videoPaths = paths.filter(isSupportedVideo);

      if (paths.length === 0) {
        setSelectionError(MISSING_PATH_ERROR);
        return;
      }

      if (videoPaths.length === 0) {
        setSelectionError(
          `Unsupported format. Please use ${SUPPORTED_VIDEO_EXTENSIONS.join(", ")}.`
        );
        return;
      }

      for (const filePath of videoPaths) {
        await importProject(filePath);
      }
    },
    [importProject, resolveDroppedPaths]
  );

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      if (file?.path) {
        void importVideoFile(file.path);
      }
      event.currentTarget.value = "";
    },
    [importVideoFile]
  );

  const handleClick = useCallback(async () => {
    const filePath = await window.electronAPI.invoke<string | null>(
      IPC_CHANNELS.DIALOG_OPEN_FILE,
      {
        properties: ["openFile"],
        filters: [
          {
            name: "Video files",
            extensions: SUPPORTED_VIDEO_EXTENSIONS.map((ext) => ext.slice(1)),
          },
        ],
      }
    );
    if (filePath) void importVideoFile(filePath);
  }, [importVideoFile]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void handleClick();
      }
    },
    [handleClick]
  );

  const displayError = selectionError || importError;

  return (
    <div
      id="import-zone"
      role="button"
      tabIndex={0}
      aria-label="Import video"
      onClick={() => void handleClick()}
      onKeyDown={handleKeyDown}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "group relative flex cursor-pointer flex-col items-center justify-center text-center transition-all duration-200",
        "rounded-xl border-2 border-dashed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isCompact ? "flex-row gap-4 px-5 py-4" : "px-8 py-14 sm:py-16",
        isDragging
          ? "border-primary bg-primary/8 import-zone-active"
          : "border-border/80 bg-card/40 hover:border-primary/40 hover:bg-card/60",
        isCompact && !isDragging && "surface-card border-solid"
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_FILTER}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFileInputChange}
      />

      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20 transition-transform group-hover:scale-105",
          isCompact ? "h-11 w-11 rounded-xl" : "mb-5 h-16 w-16"
        )}
      >
        {isImporting ? (
          <Loader2 className={cn("animate-spin text-primary", isCompact ? "h-5 w-5" : "h-8 w-8")} />
        ) : isCompact ? (
          <Video className="h-5 w-5 text-primary" />
        ) : (
          <Upload className="h-8 w-8 text-primary" />
        )}
      </div>

      <div className={cn(isCompact ? "min-w-0 flex-1 text-left" : "max-w-md")}>
        <h3 className={cn("font-semibold", isCompact ? "text-sm" : "mb-2 text-lg")}>
          {isImporting
            ? "Importing video…"
            : isCompact
              ? "Import another video"
              : "Drop your video here"}
        </h3>
        <p className={cn("text-muted-foreground", isCompact ? "text-xs" : "text-sm")}>
          {isCompact
            ? "Click or drag to add a new project"
            : `Click or drag and drop. Supports ${SUPPORTED_VIDEO_EXTENSIONS.join(", ")}.`}
        </p>
        {displayError && (
          <p className={cn("text-destructive", isCompact ? "mt-1 text-xs" : "mt-3 text-sm")}>
            {displayError}
          </p>
        )}
      </div>
    </div>
  );
}
