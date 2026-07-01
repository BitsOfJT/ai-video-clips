import { access, constants as fsConstants, existsSync } from "node:fs";
import { readFile, mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import Database from "better-sqlite3";
import type {
  AnalysisStatus,
  AppSettings,
  CreateProjectInput,
  Project,
  StartAnalysisInput,
  UpdateSettingsInput,
  UpdateStatus,
  VideoMetadata,
  Clip,
  SystemHealthCheck,
} from "../src/types/electron";
import { CONTENT_SECURITY_POLICY, IPC_CHANNELS, SUPPORTED_VIDEO_EXTENSIONS, WINDOW } from "../src/constants";
import { getSettings, getGeminiApiKey, updateSettings } from "./settings";
import { analyzeProject, type AnalyzedClip } from "./analysis/analyzer";
import { extractKeyframes } from "./analysis/keyframes";
import type { AnalysisProvider } from "./analysis/providers/types";
import { GeminiProvider } from "./analysis/providers/gemini";
import { OllamaProvider } from "./analysis/providers/ollama";
import { logger, initLogger, friendlyExitMessage } from "./logger";
import { runSystemHealthCheck } from "./health";
import { registerAppVideoHandler, registerAppVideoScheme } from "./app-video-protocol";
import { autoUpdater } from "electron-updater";
import { createUpdateService, type UpdateService, type AppUpdateEvent } from "./updater";
import {
  buildBatchOutputPaths,
  buildWordsJsonPath,
  createExportJobFromClip,
  markClipQueued,
  type ExportJobInput,
} from "./export-helpers";
import {
  getBundledFfmpegPath,
  getBundledFfprobePath,
  getEditorPath,
  getModelPath,
  getTranscriberPath,
} from "./paths";
import { getProductionRendererHtmlPath } from "./renderer-path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Guard against tooling that sets ELECTRON_RUN_AS_NODE (breaks `import from "electron"`).
delete process.env.ELECTRON_RUN_AS_NODE;

registerAppVideoScheme();

const execFileAsync = promisify(execFile);

// Helper to resolve FFmpeg path (user override → bundled → system PATH in dev)
function getFfmpegPath(db: Database.Database): string {
  const settings = getSettings(db);
  if (settings.ffmpegPath && existsSync(settings.ffmpegPath)) {
    return settings.ffmpegPath;
  }
  const bundled = getBundledFfmpegPath();
  if (bundled) {
    return bundled;
  }
  return "ffmpeg";
}

function getFfprobePath(db: Database.Database): string {
  const settings = getSettings(db);
  if (settings.ffmpegPath && existsSync(settings.ffmpegPath)) {
    const dir = path.dirname(settings.ffmpegPath);
    const ext = process.platform === "win32" ? ".exe" : "";
    const probePath = path.join(dir, `ffprobe${ext}`);
    if (existsSync(probePath)) return probePath;
  }
  const bundled = getBundledFfprobePath();
  if (bundled) {
    return bundled;
  }
  return "ffprobe";
}

let mainWindow: BrowserWindow | null = null;
let db: Database.Database | null = null;
let probeInProgress = false;

// Track active transcription child processes so they can be cleaned up on quit
const activeTranscriptions = new Map<string, ChildProcess>();

// Guard against concurrent analysis runs for the same project (analysis is
// async I/O, not a child process, so a Set of project IDs suffices).
const activeAnalyses = new Set<string>();

// Track active export child processes
const activeExports = new Map<string, ChildProcess>();

interface ExportJob {
  clipId: string;
  outputPath: string;
  videoPath: string;
  startMs: number;
  endMs: number;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  wordsJsonPath: string | null;
}

const exportQueue: ExportJob[] = [];
let activeExportJob: ExportJob | null = null;

function enqueueExportJob(database: Database.Database, job: ExportJobInput): void {
  markClipQueued(database, job.clipId);
  exportQueue.push(job);
  void processNextExportJob();
}

async function cancelExportsForClipIds(
  database: Database.Database,
  clipIds: Set<string>
): Promise<void> {
  if (activeExportJob && clipIds.has(activeExportJob.clipId)) {
    const child = activeExports.get(activeExportJob.clipId);
    child?.kill();
    activeExportJob = null;
  }

  for (let i = exportQueue.length - 1; i >= 0; i--) {
    const job = exportQueue[i];
    if (!clipIds.has(job.clipId)) continue;

    if (job.wordsJsonPath) {
      try {
        await unlink(job.wordsJsonPath);
      } catch {
        /* ignore */
      }
    }
    exportQueue.splice(i, 1);
    database.prepare("UPDATE clips SET status = 'suggested' WHERE id = ?").run(job.clipId);
  }
}

// ------------------------------------------------------------------------------
// Window Management
// ------------------------------------------------------------------------------

function attachRendererDiagnostics(win: BrowserWindow): void {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    logger.error("renderer", "Page failed to load", {
      errorCode,
      errorDescription,
      validatedURL,
    });
    if (!isDev) {
      void dialog.showErrorBox(
        "Failed to load application",
        `The app window could not load. Try reinstalling the app.\n\n(${errorDescription}, code ${errorCode})`
      );
    }
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    logger.error("renderer", "Render process gone", {
      reason: details.reason,
      exitCode: details.exitCode,
    });
  });
}

function createWindow(): void {
  const preloadPath = path.join(__dirname, "../preload/preload.cjs");

  mainWindow = new BrowserWindow({
    width: WINDOW.WIDTH,
    height: WINDOW.HEIGHT,
    minWidth: WINDOW.MIN_WIDTH,
    minHeight: WINDOW.MIN_HEIGHT,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  attachRendererDiagnostics(mainWindow);
  configureSecurityPolicy();

  void loadRenderer().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("renderer", "loadRenderer failed", { message });
    if (!process.env.VITE_DEV_SERVER_URL) {
      void dialog.showErrorBox(
        "Failed to load application",
        `The app window could not load. Try reinstalling the app.\n\n(${message})`
      );
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function loadRenderer(): Promise<void> {
  if (!mainWindow) return;

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    return;
  }

  const htmlPath = getProductionRendererHtmlPath(app.getAppPath());
  await mainWindow.loadFile(htmlPath);
}

function configureSecurityPolicy(): void {
  if (!mainWindow) return;

  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  const csp = isDev
    ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173 ws://localhost:5173; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173; style-src 'self' 'unsafe-inline' http://localhost:5173 https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: http://localhost:5173; connect-src 'self' ws://localhost:5173 http://localhost:5173; media-src app-video:;"
    : CONTENT_SECURITY_POLICY;

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });
}

// ------------------------------------------------------------------------------
// Database
// ------------------------------------------------------------------------------

function initDatabase(): Database.Database {
  const dbPath = path.join(app.getPath("userData"), "database.sqlite");
  const database = new Database(dbPath);

  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      video_path TEXT NOT NULL,
      title TEXT,
      duration_sec REAL,
      width INTEGER,
      height INTEGER,
      fps REAL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clips (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      start_ms INTEGER,
      end_ms INTEGER,
      ai_score REAL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Migrate: add columns if missing. Each migration is additive and idempotent.
  const addColumnIfMissing = (table: string, column: string, ddl: string): void => {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((c) => c.name === column)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl};`);
    }
  };

  // Phase 2: transcript columns
  addColumnIfMissing("projects", "transcript_status", "transcript_status TEXT DEFAULT 'idle'");
  addColumnIfMissing("projects", "transcript_json", "transcript_json TEXT");

  // Phase 3: creative brief + analysis state on projects
  addColumnIfMissing("projects", "creative_brief", "creative_brief TEXT");
  addColumnIfMissing("projects", "video_type", "video_type TEXT");
  addColumnIfMissing("projects", "analysis_status", "analysis_status TEXT DEFAULT 'idle'");

  // Phase 3: AI scoring breakdown + metadata on clips
  addColumnIfMissing("clips", "title", "title TEXT");
  addColumnIfMissing("clips", "description", "description TEXT");
  addColumnIfMissing("clips", "hook_strength", "hook_strength REAL");
  addColumnIfMissing("clips", "brief_relevance", "brief_relevance REAL");
  addColumnIfMissing("clips", "self_containment", "self_containment REAL");
  addColumnIfMissing("clips", "emotional_arc", "emotional_arc REAL");
  addColumnIfMissing("clips", "platform_fit", "platform_fit REAL");
  addColumnIfMissing("clips", "reasoning", "reasoning TEXT");

  // Phase 4: thumbnail cache path on clips
  addColumnIfMissing("clips", "thumbnail_path", "thumbnail_path TEXT");

  // Phase 5: crop settings
  addColumnIfMissing("clips", "crop_x", "crop_x INTEGER DEFAULT -1");
  addColumnIfMissing("clips", "crop_y", "crop_y INTEGER DEFAULT -1");
  addColumnIfMissing("clips", "crop_w", "crop_w INTEGER DEFAULT -1");
  addColumnIfMissing("clips", "crop_h", "crop_h INTEGER DEFAULT -1");

  // Phase 6: persist export output path for reveal-in-folder after restart
  addColumnIfMissing("clips", "output_path", "output_path TEXT");

  return database;
}

function requireDatabase(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}

// ------------------------------------------------------------------------------
// Transcription
// ------------------------------------------------------------------------------

// Path helpers live in electron/paths.ts (getTranscriberPath, getModelPath, getEditorPath).

// ------------------------------------------------------------------------------
// Video Probing
// ------------------------------------------------------------------------------

async function probeVideoMetadata(videoPath: string): Promise<VideoMetadata> {
  const database = requireDatabase();
  const ffprobePath = getFfprobePath(database);
  
  logger.subprocess("ffprobe", ffprobePath, ["-show_format", "-show_streams", videoPath]);
  
  let stdout: string;
  try {
    const result = await execFileAsync(ffprobePath, [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      videoPath,
    ]);
    stdout = result.stdout;
  } catch (err) {
    const execErr = err as { message?: string; code?: string | number | null };
    logger.error("ffprobe", `Failed to probe video: ${execErr.message ?? "unknown error"}`);
    const exitCode = typeof execErr.code === "number" ? execErr.code : 1;
    throw new Error(friendlyExitMessage("ffprobe", exitCode), {
      cause: err,
    });
  }

  const probe = JSON.parse(stdout) as {
    streams?: Array<{
      codec_type?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
    }>;
    format?: { duration?: number | string };
  };

  if (!probe.streams || !Array.isArray(probe.streams)) {
    throw new Error("Invalid probe response: no streams");
  }

  const videoStream = probe.streams.find((stream) => stream.codec_type === "video");

  if (!videoStream) {
    throw new Error("No video stream found");
  }

  const rawRate = videoStream.r_frame_rate ?? "0/1";
  const fps = parseFrameRate(rawRate);
  const duration = Number(probe.format?.duration ?? 0);

  return {
    durationSec: duration,
    width: videoStream.width ?? 0,
    height: videoStream.height ?? 0,
    fps,
  };
}

function parseFrameRate(rawRate: string): number {
  const [numPart, denPart] = rawRate.split("/");
  const num = Number(numPart) || 0;
  const den = denPart ? (Number(denPart) || 1) : 1;
  return den !== 0 ? num / den : 0;
}

async function validateVideoPath(videoPath: string): Promise<string> {
  if (!path.isAbsolute(videoPath)) {
    throw new Error("Invalid video path");
  }

  const ext = path.extname(videoPath).toLowerCase();
  if (!SUPPORTED_VIDEO_EXTENSIONS.includes(ext)) {
    throw new Error("Unsupported video format");
  }

  const resolvedPath = path.resolve(videoPath);
  await accessPromise(resolvedPath, fsConstants.R_OK);

  return resolvedPath;
}

const accessPromise = promisify(access);

// ------------------------------------------------------------------------------
// Analysis
// ------------------------------------------------------------------------------

/** Construct the configured AI provider, surfacing a friendly error if misconfigured. */
function buildProvider(database: Database.Database): AnalysisProvider {
  const settings = getSettings(database);
  if (settings.provider === "gemini") {
    const apiKey = getGeminiApiKey(database);
    if (!apiKey) {
      throw new Error("No Gemini API key set. Add one in Settings, or switch to Ollama (local).");
    }
    return new GeminiProvider(apiKey);
  }
  return new OllamaProvider(settings.ollamaBaseUrl, settings.ollamaTextModel, settings.ollamaVisionModel);
}

/** Replace a project's clips with a freshly analyzed set in a single transaction. */
function persistClips(database: Database.Database, projectId: string, clips: AnalyzedClip[]): void {
  const deleteStmt = database.prepare("DELETE FROM clips WHERE project_id = ?");
  const insertStmt = database.prepare(
    `INSERT INTO clips (
       id, project_id, start_ms, end_ms, ai_score, status,
       title, description, hook_strength, brief_relevance,
       self_containment, emotional_arc, platform_fit, reasoning
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const tx = database.transaction((rows: AnalyzedClip[]) => {
    deleteStmt.run(projectId);
    for (const c of rows) {
      insertStmt.run(
        randomUUID(),
        projectId,
        c.startMs,
        c.endMs,
        c.overall,
        "suggested",
        c.title,
        c.description,
        c.scores.hook_strength,
        c.scores.brief_relevance,
        c.scores.self_containment,
        c.scores.emotional_arc,
        c.scores.platform_fit,
        c.reasoning
      );
    }
  });
  tx(clips);
}

// ------------------------------------------------------------------------------
// Video Editing & Exporting
// ------------------------------------------------------------------------------

async function processNextExportJob(): Promise<void> {
  if (activeExportJob) return;

  const job = exportQueue.shift();
  if (!job) return;

  activeExportJob = job;

  const database = requireDatabase();
  database.prepare("UPDATE clips SET status = 'rendering' WHERE id = ?").run(job.clipId);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.EXPORT_PROGRESS, { clipId: job.clipId, percent: 0 });
  }

  const editorPath = getEditorPath();
  if (!existsSync(editorPath)) {
    activeExportJob = null;
    if (job.wordsJsonPath) {
      try {
        await unlink(job.wordsJsonPath);
      } catch {
        // Best-effort cleanup of temporary word JSON; ignore failures.
      }
    }
    database.prepare("UPDATE clips SET status = 'failed', output_path = NULL WHERE id = ?").run(job.clipId);
    const errorMsg = `Editor binary not found at ${editorPath}. Run 'npm run build:python' first.`;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.EXPORT_ERROR, { clipId: job.clipId, error: errorMsg });
    }
    void processNextExportJob();
    return;
  }

  const args = [
    "--video-path", job.videoPath,
    "--output-path", job.outputPath,
    "--start-ms", String(job.startMs),
    "--end-ms", String(job.endMs),
    "--crop-x", String(job.cropX),
    "--crop-y", String(job.cropY),
    "--crop-w", String(job.cropW),
    "--crop-h", String(job.cropH),
  ];
  if (job.wordsJsonPath) {
    args.push("--words-json", job.wordsJsonPath);
  }

  // Pass custom FFmpeg path to editor binary if set
  const ffmpegPath = getFfmpegPath(database);
  if (ffmpegPath !== "ffmpeg") {
    args.push("--ffmpeg-path", ffmpegPath);
  }

  logger.subprocess("editor", editorPath, args);
  const child = spawn(editorPath, args, { detached: false });
  activeExports.set(job.clipId, child);

  let stderrBuffer = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    stderrBuffer += text;
    // Log non-progress lines to our logger
    text.split("\n").forEach(line => {
      if (line.trim() && !line.startsWith("PROGRESS:")) {
        logger.subprocessStderr("editor", line);
      }
    });
    const lines = stderrBuffer.split("\n");
    stderrBuffer = lines.pop() || "";

    for (const line of lines) {
      const match = line.match(/^PROGRESS:\s*(\d+)/);
      if (match) {
        const percent = parseInt(match[1], 10);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.EXPORT_PROGRESS, { clipId: job.clipId, percent });
        }
      }
    }
  });

  child.on("exit", async (code, signal) => {
    logger.subprocessExit("editor", code, signal);
    activeExports.delete(job.clipId);
    activeExportJob = null;

    if (job.wordsJsonPath) {
      try {
        await unlink(job.wordsJsonPath);
      } catch {
        // Best-effort cleanup of temporary word JSON; ignore failures.
      }
    }

    if (code !== 0) {
      database.prepare("UPDATE clips SET status = 'failed', output_path = NULL WHERE id = ?").run(job.clipId);
      if (mainWindow && !mainWindow.isDestroyed()) {
        const errorMsg = friendlyExitMessage("editor", code);
        mainWindow.webContents.send(IPC_CHANNELS.EXPORT_ERROR, {
          clipId: job.clipId,
          error: errorMsg,
        });
      }
    } else {
      database
        .prepare("UPDATE clips SET status = 'completed', output_path = ? WHERE id = ?")
        .run(job.outputPath, job.clipId);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.EXPORT_COMPLETE, {
          clipId: job.clipId,
          outputPath: job.outputPath,
        });
      }
    }

    void processNextExportJob();
  });

  child.on("error", async (err) => {
    activeExports.delete(job.clipId);
    activeExportJob = null;

    if (job.wordsJsonPath) {
      try {
        await unlink(job.wordsJsonPath);
      } catch {
        // Best-effort cleanup of temporary word JSON; ignore failures.
      }
    }

    database.prepare("UPDATE clips SET status = 'failed', output_path = NULL WHERE id = ?").run(job.clipId);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.EXPORT_ERROR, {
        clipId: job.clipId,
        error: err.message,
      });
    }

    void processNextExportJob();
  });
}

// ------------------------------------------------------------------------------
// Auto-update
// ------------------------------------------------------------------------------

let updateService: UpdateService | null = null;

function broadcastUpdateStatus(): void {
  if (!updateService || !mainWindow) {
    return;
  }
  mainWindow.webContents.send(IPC_CHANNELS.UPDATE_STATUS, updateService.getStatus());
}

function setupUpdateService(): void {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  if (isDev) {
    return;
  }

  updateService = createUpdateService({
    autoUpdater,
    getVersion: () => app.getVersion(),
    isDev,
    platform: process.platform,
    openExternal: (url) => shell.openExternal(url),
  });

  const updateEvents: AppUpdateEvent[] = [
    "checking",
    "available",
    "not-available",
    "progress",
    "downloaded",
    "error",
  ];
  for (const event of updateEvents) {
    updateService.on(event, () => {
      broadcastUpdateStatus();
    });
  }
}

function scheduleStartupUpdateCheck(): void {
  if (!updateService) {
    return;
  }
  setTimeout(() => {
    void updateService?.checkForUpdates({ manual: false });
  }, 5000);
}

// ------------------------------------------------------------------------------
// IPC Handlers
// ------------------------------------------------------------------------------

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.VIDEO_PROBE_METADATA, async (_event, videoPath: string): Promise<VideoMetadata> => {
    if (probeInProgress) {
      throw new Error("A video probe is already in progress");
    }

    try {
      probeInProgress = true;
      await validateVideoPath(videoPath);

      try {
        return await probeVideoMetadata(videoPath);
      } catch {
        throw new Error("Failed to read video metadata. The file may be corrupt or unsupported.");
      }
    } finally {
      probeInProgress = false;
    }
  });

  ipcMain.handle(IPC_CHANNELS.DB_GET_PROJECTS, (): Project[] => {
    const database = requireDatabase();
    return database
      .prepare(
        "SELECT id, video_path, title, duration_sec, width, height, fps, status, transcript_status, transcript_json, creative_brief, video_type, analysis_status, created_at FROM projects ORDER BY created_at DESC"
      )
      .all() as Project[];
  });

  ipcMain.handle(IPC_CHANNELS.DB_CREATE_PROJECT, async (_event, input: CreateProjectInput): Promise<Project> => {
    const database = requireDatabase();

    const resolvedPath = await validateVideoPath(input.videoPath);
    const id = randomUUID();
    const title = path.basename(resolvedPath, path.extname(resolvedPath));

    database
      .prepare(
        `INSERT INTO projects (id, video_path, title, duration_sec, width, height, fps, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        resolvedPath,
        title,
        input.metadata.durationSec,
        input.metadata.width,
        input.metadata.height,
        input.metadata.fps,
        "pending"
      );

    const row = database.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project;
    return row;
  });

  ipcMain.handle(IPC_CHANNELS.DB_GET_CLIPS, (_event, projectId: string) => {
    const database = requireDatabase();
    return database
      .prepare("SELECT * FROM clips WHERE project_id = ? ORDER BY ai_score DESC")
      .all(projectId);
  });

  ipcMain.handle(IPC_CHANNELS.DB_DELETE_PROJECT, async (_event, projectId: string): Promise<void> => {
    const database = requireDatabase();

    const project = database.prepare("SELECT id FROM projects WHERE id = ?").get(projectId) as
      | { id: string }
      | undefined;
    if (!project) {
      throw new Error("Project not found");
    }

    if (activeAnalyses.has(projectId)) {
      throw new Error("Analysis in progress — wait for it to finish before deleting.");
    }

    const transcriptionChild = activeTranscriptions.get(projectId);
    if (transcriptionChild) {
      transcriptionChild.kill();
      activeTranscriptions.delete(projectId);
    }

    const projectClips = database
      .prepare("SELECT id FROM clips WHERE project_id = ?")
      .all(projectId) as Array<{ id: string }>;
    const clipIds = new Set(projectClips.map((c) => c.id));

    await cancelExportsForClipIds(database, clipIds);

    const userData = app.getPath("userData");
    try {
      await unlink(path.join(userData, `transcript-${projectId}.json`));
    } catch {
      /* ignore */
    }

    const thumbnailDir = path.join(userData, "thumbnails");
    for (const clip of projectClips) {
      try {
        await unlink(path.join(thumbnailDir, `${clip.id}.jpg`));
      } catch {
        /* ignore */
      }
      try {
        await unlink(path.join(userData, `words-${clip.id}.json`));
      } catch {
        /* ignore */
      }
    }

    const deleteProjectTx = database.transaction(() => {
      database.prepare("DELETE FROM clips WHERE project_id = ?").run(projectId);
      database.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
    });
    deleteProjectTx();
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (): AppSettings => getSettings(requireDatabase()));

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, input: UpdateSettingsInput): AppSettings =>
    updateSettings(requireDatabase(), input)
  );

  ipcMain.handle(IPC_CHANNELS.ANALYSIS_START, async (_event, input: StartAnalysisInput): Promise<void> => {
    const database = requireDatabase();
    const { projectId, creativeBrief, videoType } = input;

    if (activeAnalyses.has(projectId)) {
      throw new Error("Analysis already in progress for this project");
    }

    const project = database
      .prepare("SELECT video_path, transcript_json FROM projects WHERE id = ?")
      .get(projectId) as { video_path: string; transcript_json: string | null } | undefined;

    if (!project) {
      throw new Error("Project not found");
    }
    if (!project.transcript_json) {
      throw new Error("Transcribe the video before running analysis.");
    }

    let transcript: unknown;
    try {
      transcript = JSON.parse(project.transcript_json);
    } catch {
      throw new Error("Stored transcript is corrupted. Re-run transcription.");
    }

    // Re-validate the video path and build the provider before marking as running.
    const resolvedVideoPath = await validateVideoPath(project.video_path);
    const provider = buildProvider(database);

    activeAnalyses.add(projectId);
    database
      .prepare("UPDATE projects SET creative_brief = ?, video_type = ?, analysis_status = 'scoring' WHERE id = ?")
      .run(creativeBrief, videoType, projectId);

    const sendProgress = (stage: AnalysisStatus, percent: number): void => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.ANALYSIS_PROGRESS, { projectId, percent, stage });
      }
    };

    try {
      const clips = await analyzeProject({
        provider,
        transcript,
        videoPath: resolvedVideoPath,
        creativeBrief,
        videoType,
        ffmpegPath: getFfmpegPath(database),
        onProgress: sendProgress,
      });

      const stillExists = database.prepare("SELECT id FROM projects WHERE id = ?").get(projectId);
      if (!stillExists) {
        return;
      }

      persistClips(database, projectId, clips);
      database.prepare("UPDATE projects SET analysis_status = 'completed' WHERE id = ?").run(projectId);

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.ANALYSIS_COMPLETE, { projectId });
      }
    } catch (err) {
      database.prepare("UPDATE projects SET analysis_status = 'failed' WHERE id = ?").run(projectId);
      const message = err instanceof Error ? err.message : "Analysis failed";
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.ANALYSIS_ERROR, { projectId, error: message });
      }
      throw new Error(message, { cause: err });
    } finally {
      activeAnalyses.delete(projectId);
    }
  });
  ipcMain.handle(IPC_CHANNELS.TRANSCRIPTION_START, async (_event, projectId: string, extractAudio: boolean): Promise<void> => {
    const database = requireDatabase();
    const project = database
      .prepare("SELECT video_path FROM projects WHERE id = ?")
      .get(projectId) as { video_path: string } | undefined;

    if (!project) {
      throw new Error("Project not found");
    }

    // Prevent concurrent transcription runs for the same project
    if (activeTranscriptions.has(projectId)) {
      throw new Error("Transcription already in progress for this project");
    }

    // Re-validate the video path for security before passing it to the child process
    const resolvedVideoPath = await validateVideoPath(project.video_path);

    const transcriberPath = getTranscriberPath();
    if (!existsSync(transcriberPath)) {
      throw new Error(
        `Transcriber binary not found at ${transcriberPath}. ` +
        "Run 'npm run build:python' to build it."
      );
    }

    const modelPath = getModelPath();
    const outputJson = path.join(app.getPath("userData"), `transcript-${projectId}.json`);

    // Set the initial running status so the UI can reflect it immediately
    database
      .prepare("UPDATE projects SET transcript_status = ? WHERE id = ?")
      .run(extractAudio ? "extracting_audio" : "transcribing", projectId);

    const args = ["--video-path", resolvedVideoPath, "--model-dir", modelPath, "--output-json", outputJson];
    if (extractAudio) {
      args.push("--extract-audio");
    }
    
    // Pass custom FFmpeg path to transcriber binary if set (used for audio extraction)
    const ffmpegPath = getFfmpegPath(database);
    if (ffmpegPath !== "ffmpeg") {
      args.push("--ffmpeg-path", ffmpegPath);
    }

    logger.subprocess("transcriber", transcriberPath, args);
    const child = spawn(transcriberPath, args, { detached: false });
    activeTranscriptions.set(projectId, child);

    // Parse stderr for PROGRESS: XX lines and forward them to the renderer
    let stderrBuffer = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderrBuffer += text;
      // Log non-progress lines to our logger
      text.split("\n").forEach(line => {
        if (line.trim() && !line.startsWith("PROGRESS:")) {
          logger.subprocessStderr("transcriber", line);
        }
      });
      const lines = stderrBuffer.split("\n");
      stderrBuffer = lines.pop() || "";

      for (const line of lines) {
        const match = line.match(/^PROGRESS:\s*(\d+)/);
        if (match) {
          const percent = parseInt(match[1], 10);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC_CHANNELS.TRANSCRIPTION_PROGRESS, { projectId, percent });
          }
        }
      }
    });

    return new Promise<void>((resolve, reject) => {
      child.on("exit", async (code, signal) => {
        logger.subprocessExit("transcriber", code, signal);
        activeTranscriptions.delete(projectId);

        if (code !== 0) {
          database.prepare("UPDATE projects SET transcript_status = 'failed' WHERE id = ?").run(projectId);
          const exitMessage = friendlyExitMessage("transcriber", code);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC_CHANNELS.TRANSCRIPTION_ERROR, {
              projectId,
              error: exitMessage,
            });
          }
          reject(new Error(exitMessage));
          return;
        }

        // Read the final transcript JSON from disk and persist it in the DB
        try {
          const transcriptJson = await readFile(outputJson, "utf-8");
          database
            .prepare("UPDATE projects SET transcript_status = 'completed', transcript_json = ? WHERE id = ?")
            .run(transcriptJson, projectId);

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC_CHANNELS.TRANSCRIPTION_COMPLETE, { projectId });
          }
          resolve();
        } catch (err) {
          database.prepare("UPDATE projects SET transcript_status = 'failed' WHERE id = ?").run(projectId);
          // Sanitize the error before sending it to the renderer to avoid leaking system paths
          const sanitizedMessage = "Failed to read transcription output. The file may have been deleted or corrupted.";
          console.error("Transcript read error:", err);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC_CHANNELS.TRANSCRIPTION_ERROR, {
              projectId,
              error: sanitizedMessage,
            });
          }
          reject(new Error(sanitizedMessage));
        }
      });

      child.on("error", (err) => {
        activeTranscriptions.delete(projectId);
        database.prepare("UPDATE projects SET transcript_status = 'failed' WHERE id = ?").run(projectId);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.TRANSCRIPTION_ERROR, { projectId, error: err.message });
        }
        reject(err);
      });
    });
  });

  ipcMain.handle(IPC_CHANNELS.CLIP_GET_THUMBNAIL, async (_event, clipId: string): Promise<string> => {
    const database = requireDatabase();

    const clip = database
      .prepare("SELECT start_ms, end_ms, project_id FROM clips WHERE id = ?")
      .get(clipId) as { start_ms: number; end_ms: number; project_id: string } | undefined;

    if (!clip) {
      throw new Error("Clip not found");
    }

    const project = database
      .prepare("SELECT video_path FROM projects WHERE id = ?")
      .get(clip.project_id) as { video_path: string } | undefined;

    if (!project) {
      throw new Error("Project not found");
    }

    // Re-validate the video path stored in the DB before passing it to FFmpeg.
    // The DB row may be the canonical source of truth, but validateVideoPath adds
    // defence-in-depth: absolute path check, extension whitelist, and readability
    // confirmation. This prevents a tampered/injected DB row from reaching FFmpeg.
    const resolvedVideoPath = await validateVideoPath(project.video_path);

    const thumbnailDir = path.join(app.getPath("userData"), "thumbnails");
    await mkdir(thumbnailDir, { recursive: true });

    let frames: string[];
    try {
      frames = await extractKeyframes(resolvedVideoPath, clip.start_ms, clip.end_ms, 1, 512, getFfmpegPath(database));
    } catch (err) {
      // Log the real error server-side; surface only a generic message to the renderer.
      console.error("extractKeyframes failed for clip", clipId, err);
      throw new Error("Failed to extract thumbnail", { cause: err });
    }

    if (!frames.length) {
      return "";
    }

    const base64 = frames[0];

    // Use only the clipId (a UUID) for the filename — never any user-controlled value.
    const thumbnailPath = path.join(thumbnailDir, `${clipId}.jpg`);
    try {
      await writeFile(thumbnailPath, Buffer.from(base64, "base64"));
    } catch (err) {
      console.error("Failed to write thumbnail to disk for clip", clipId, err);
      // Non-fatal: the base64 payload is still returned to the renderer.
    }

    database
      .prepare("UPDATE clips SET thumbnail_path = ? WHERE id = ?")
      .run(thumbnailPath, clipId);

    return base64;
  });

  ipcMain.handle(IPC_CHANNELS.CLIP_UPDATE, async (_event, clipId: string, updates: Partial<Clip>): Promise<void> => {
    const database = requireDatabase();
    const allowedKeys: string[] = [
      "start_ms",
      "end_ms",
      "title",
      "description",
      "crop_x",
      "crop_y",
      "crop_w",
      "crop_h",
      "status",
    ];
    const setClauses: string[] = [];
    const params: unknown[] = [];

    for (const key of allowedKeys) {
      const val = (updates as Record<string, unknown>)[key];
      if (val !== undefined) {
        setClauses.push(`${key} = ?`);
        params.push(val);
      }
    }

    if (setClauses.length === 0) return;

    params.push(clipId);
    database.prepare(`UPDATE clips SET ${setClauses.join(", ")} WHERE id = ?`).run(...params);
  });

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_START,
    async (_event, clipId: string, includeCaptions = true): Promise<boolean> => {
    const database = requireDatabase();

    const clip = database
      .prepare("SELECT * FROM clips WHERE id = ?")
      .get(clipId) as Clip | undefined;
    if (!clip) throw new Error("Clip not found");

    const project = database
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(clip.project_id) as Project | undefined;
    if (!project) throw new Error("Project not found");

    const resolvedVideoPath = await validateVideoPath(project.video_path);

    if (!mainWindow) throw new Error("Main window not available");
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: "Export Clip",
      defaultPath: path.join(app.getPath("downloads"), `${clip.title || "clip"}.mp4`),
      filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
    });

    if (canceled || !filePath) return false;

    const wordsJsonPath = includeCaptions
      ? await buildWordsJsonPath(clipId, clip, project)
      : null;
    enqueueExportJob(
      database,
      createExportJobFromClip(clip, resolvedVideoPath, filePath, wordsJsonPath)
    );
    return true;
  });

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_START_BATCH,
    async (
      _event,
      projectId: string,
      clipIds: string[],
      includeCaptions = true
    ): Promise<boolean> => {
    const database = requireDatabase();

    if (!Array.isArray(clipIds) || clipIds.length === 0) {
      throw new Error("No clips selected for export");
    }

    const project = database
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(projectId) as Project | undefined;
    if (!project) throw new Error("Project not found");

    const clipIdSet = new Set(clipIds);
    const clips = (database
      .prepare("SELECT * FROM clips WHERE project_id = ? ORDER BY ai_score DESC")
      .all(projectId) as Clip[]).filter((c) => clipIdSet.has(c.id));

    if (clips.length === 0) {
      throw new Error("No clips to export");
    }
    if (clips.length !== clipIds.length) {
      throw new Error("One or more selected clips were not found");
    }

    if (!mainWindow) throw new Error("Main window not available");
    const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
      title: "Choose Export Folder",
      properties: ["openDirectory", "createDirectory"],
    });

    if (canceled || !filePaths?.[0]) return false;

    const resolvedVideoPath = await validateVideoPath(project.video_path);
    const outputPaths = buildBatchOutputPaths(filePaths[0], clips);

    for (const clip of clips) {
      const outputPath = outputPaths.get(clip.id);
      if (!outputPath) continue;

      const wordsJsonPath = includeCaptions
        ? await buildWordsJsonPath(clip.id, clip, project)
        : null;
      enqueueExportJob(
        database,
        createExportJobFromClip(clip, resolvedVideoPath, outputPath, wordsJsonPath)
      );
    }
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.EXPORT_CANCEL, async (_event, clipId: string): Promise<void> => {
    const database = requireDatabase();

    if (activeExportJob && activeExportJob.clipId === clipId) {
      const child = activeExports.get(clipId);
      if (child) {
        child.kill();
      }
      return;
    }

    const idx = exportQueue.findIndex((job) => job.clipId === clipId);
    if (idx !== -1) {
      const job = exportQueue[idx];
      exportQueue.splice(idx, 1);
      
      if (job.wordsJsonPath) {
        try {
          await unlink(job.wordsJsonPath);
        } catch {
          // Best-effort cleanup of temporary word JSON; ignore failures.
        }
      }

      database.prepare("UPDATE clips SET status = 'suggested' WHERE id = ?").run(clipId);
    }
  });

  ipcMain.handle(IPC_CHANNELS.SHELL_SHOW_ITEM, async (_event, filePath: string): Promise<void> => {
    if (!path.isAbsolute(filePath)) {
      throw new Error("Invalid path");
    }

    const resolved = path.resolve(filePath);

    // Reject paths that still contain traversal segments after resolution.
    if (filePath.includes("..") || resolved.includes("..")) {
      throw new Error("Invalid path");
    }

    // Validate the file being revealed is either a known export output or a known project video.
    // This prevents an arbitrary file from being opened via a compromised renderer.
    const database = requireDatabase();
    const outputRow = database
      .prepare(
        "SELECT output_path FROM clips WHERE status = 'completed' AND output_path IS NOT NULL AND output_path = ?"
      )
      .get(resolved) as { output_path: string } | undefined;
    const videoRow = database
      .prepare("SELECT video_path FROM projects WHERE video_path = ?")
      .get(resolved) as { video_path: string } | undefined;

    if (!outputRow && !videoRow) {
      throw new Error("Invalid path");
    }

    await accessPromise(resolved, fsConstants.R_OK);
    shell.showItemInFolder(resolved);
  });

  ipcMain.handle(
    IPC_CHANNELS.DIALOG_OPEN_FILE,
    async (_event, options: Electron.OpenDialogOptions): Promise<string | null> => {
      if (!mainWindow) return null;
      const result = await dialog.showOpenDialog(mainWindow, options);
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
    }
  );

  ipcMain.handle(IPC_CHANNELS.SYSTEM_HEALTH_CHECK, async (): Promise<SystemHealthCheck> => {
    return runSystemHealthCheck(requireDatabase());
  });

  ipcMain.handle(IPC_CHANNELS.FFMPEG_VALIDATE, async (_event, ffmpegPath: string): Promise<boolean> => {
    try {
      if (!ffmpegPath) return false;
      const { stdout } = await execFileAsync(ffmpegPath, ["-version"]);
      return stdout.includes("ffmpeg");
    } catch {
      return false;
    }
  });

  ipcMain.handle(IPC_CHANNELS.OLLAMA_LIST_MODELS, async (_event, baseUrl: string): Promise<string[]> => {
    const trimmed = (baseUrl ?? "").trim();
    if (!trimmed) {
      throw new Error("Ollama URL is empty");
    }

    let normalized: string;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Ollama URL must use http:// or https://");
      }
      if (parsed.pathname.includes("..") || trimmed.includes("@") || parsed.username || parsed.password) {
        throw new Error("Invalid Ollama URL");
      }
      normalized = `${parsed.protocol}//${parsed.host}`;
    } catch (err) {
      if (err instanceof Error && err.message.includes("Ollama URL")) {
        throw err;
      }
      throw new Error("Ollama URL must start with http:// or https://", { cause: err });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${normalized}/api/tags`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Ollama returned HTTP ${response.status}`);
      }
      const json = (await response.json().catch(() => ({}))) as {
        models?: Array<{ name?: string; model?: string }>;
      };
      const models = Array.isArray(json.models)
        ? json.models.map((m) => m.name ?? m.model ?? "").filter(Boolean)
        : [];
      return models;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("Ollama request timed out", { cause: err });
      }
      const message = err instanceof Error ? err.message : "Failed to list Ollama models";
      throw new Error(message, { cause: err });
    } finally {
      clearTimeout(timeout);
    }
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_GET_STATUS, (): UpdateStatus => {
    return (
      updateService?.getStatus() ?? {
        currentVersion: app.getVersion(),
        state: "idle",
      }
    );
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async (_event, manual = true): Promise<void> => {
    await updateService?.checkForUpdates({ manual });
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, async (): Promise<void> => {
    if (!updateService) {
      throw new Error("Updates are not available in development mode.");
    }
    await updateService.downloadUpdate();
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, (): void => {
    if (!updateService) {
      throw new Error("Updates are not available in development mode.");
    }
    updateService.quitAndInstall();
  });
}

// ------------------------------------------------------------------------------
// Application Lifecycle
// ------------------------------------------------------------------------------

app.whenReady().then(() => {
  initLogger().catch(console.error);
  db = initDatabase();
  registerAppVideoHandler(() => db);

  createWindow();
  registerIpcHandlers();
  setupUpdateService();
  scheduleStartupUpdateCheck();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Ensure any running child processes are terminated when the app quits
app.on("before-quit", () => {
  for (const [, child] of activeTranscriptions) {
    child.kill();
  }
  for (const [, child] of activeExports) {
    child.kill();
  }
});
