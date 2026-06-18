import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/renderer/lib/utils";
import { useAppStore } from "@/renderer/store/useAppStore";
import { SUPPORTED_VIDEO_EXTENSIONS } from "@/constants";

function isSupportedVideo(filePath: string): boolean {
  const lowerPath = filePath.toLowerCase();
  return SUPPORTED_VIDEO_EXTENSIONS.some((ext) => lowerPath.endsWith(ext));
}

const ACCEPT_FILTER = SUPPORTED_VIDEO_EXTENSIONS.join(",");

const MISSING_PATH_ERROR =
  "Drag and drop couldn't read the file path. Please use the click-to-import button or ensure the app has Full Disk Access.";

export default function ImportZone() {
  const [isDragging, setIsDragging] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const importProject = useAppStore((state) => state.importProject);
  const isImporting = useAppStore((state) => state.isImporting);
  const importError = useAppStore((state) => state.importError);

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

  const resolveDroppedPaths = useCallback(
    async (event: React.DragEvent): Promise<string[]> => {
      const candidates: string[] = [];

      // Strategy 1: File System Access API handles (best metadata, no real path,
      // but gives us a name to validate extension and fall back if needed).
      const items = event.dataTransfer.items
        ? Array.from(event.dataTransfer.items)
        : [];
      console.log(
        `[ImportZone] drop received: dataTransfer.items=${items.length}, files=${event.dataTransfer.files?.length ?? 0}`
      );

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log(
          `[ImportZone] item[${i}] kind=${item.kind}, type=${item.type}`
        );

        if (item.kind !== "file") {
          continue;
        }

        // Try the File System Access API first.
        if (typeof item.getAsFileSystemHandle === "function") {
          try {
            const handle = await item.getAsFileSystemHandle();
            console.log(
              `[ImportZone] item[${i}] getAsFileSystemHandle kind=${handle?.kind}`
            );
            if (handle && handle.kind === "file") {
              const fileHandle = handle as FileSystemFileHandle;
              const file = await fileHandle.getFile();
              console.log(
                `[ImportZone] item[${i}] FileSystemFileHandle file.name=${file.name}, path=${(file as File & { path?: string }).path ?? "<missing>"}`
              );
              const pathFromFile = (file as File & { path?: string }).path;
              if (pathFromFile) {
                candidates.push(pathFromFile);
              } else {
                // We don't have a real path from a handle, but we can still
                // validate by name and surface the missing-path error.
                const fakePath = `/${file.name}`;
                if (isSupportedVideo(fakePath)) {
                  console.warn(
                    `[ImportZone] item[${i}] supported video via handle but no usable path`
                  );
                }
              }
            }
          } catch (err) {
            console.warn(
              `[ImportZone] item[${i}] getAsFileSystemHandle failed:`,
              err
            );
          }
        }

        // Strategy 2: legacy getAsFile() fallback.
        const file = item.getAsFile();
        if (file) {
          const pathFromFile = (file as File & { path?: string }).path;
          console.log(
            `[ImportZone] item[${i}] getAsFile name=${file.name}, path=${pathFromFile ?? "<missing>"}`
          );
          if (pathFromFile) {
            candidates.push(pathFromFile);
          }
        }
      }

      // Strategy 3: plain files array (covers older browsers / test mocks).
      const files = Array.from(event.dataTransfer.files ?? []);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const pathFromFile = (file as File & { path?: string }).path;
        console.log(
          `[ImportZone] files[${i}] name=${file.name}, path=${pathFromFile ?? "<missing>"}`
        );
        if (pathFromFile && !candidates.includes(pathFromFile)) {
          candidates.push(pathFromFile);
        }
      }

      return candidates;
    },
    []
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = 0;
      setIsDragging(false);
      setSelectionError(null);

      const paths = await resolveDroppedPaths(event);
      console.log(`[ImportZone] resolved candidate paths:`, paths);

      const videoPaths = paths.filter(isSupportedVideo);
      console.log(`[ImportZone] supported video paths:`, videoPaths);

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
    if (window.electronAPI?.openFileDialog) {
      const filePath = await window.electronAPI.openFileDialog({
        properties: ["openFile" as const],
        filters: [
          {
            name: "Video files",
            extensions: SUPPORTED_VIDEO_EXTENSIONS.map((ext) => ext.slice(1)),
          },
        ],
      });
      if (filePath) {
        void importVideoFile(filePath);
      }
      return;
    }

    // Fallback for non-Electron environments (e.g. tests, browsers).
    fileInputRef.current?.click();
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

  return (
    <div
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
        "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:border-muted-foreground"
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

      <div className="mb-4 rounded-full bg-secondary p-4">
        <Upload className="h-8 w-8 text-secondary-foreground" />
      </div>

      <h3 className="mb-2 text-lg font-semibold">Drop your video here</h3>

      <p className="mb-4 max-w-sm text-sm text-muted-foreground">
        Click or drag and drop a video file to import it. Supported formats:{" "}
        {SUPPORTED_VIDEO_EXTENSIONS.join(", ")}.
      </p>

      {isImporting && (
        <p className="text-sm text-muted-foreground">Importing video...</p>
      )}

      {importError && (
        <p className="mt-2 text-sm text-destructive">{importError}</p>
      )}

      {selectionError && (
        <p className="mt-2 text-sm text-destructive">{selectionError}</p>
      )}
    </div>
  );
}
