import { access, constants as fsConstants, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { app, BrowserWindow, ipcMain } from "electron";
import Database from "better-sqlite3";
import type {
  AnalysisStatus,
  AppSettings,
  CreateProjectInput,
  Project,
  StartAnalysisInput,
  UpdateSettingsInput,
  VideoMetadata,
} from "../src/types/electron";
import { CONTENT_SECURITY_POLICY, IPC_CHANNELS, SUPPORTED_VIDEO_EXTENSIONS, WINDOW } from "../src/constants";
import { getSettings, getGeminiApiKey, updateSettings } from "./settings";
import { analyzeProject, type AnalyzedClip } from "./analysis/analyzer";
import type { AnalysisProvider } from "./analysis/providers/types";
import { GeminiProvider } from "./analysis/providers/gemini";
import { OllamaProvider } from "./analysis/providers/ollama";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const execFileAsync = promisify(execFile);

let mainWindow: BrowserWindow | null = null;
let db: Database.Database | null = null;
let probeInProgress = false;

// Track active transcription child processes so they can be cleaned up on quit
const activeTranscriptions = new Map<string, ChildProcess>();

// Guard against concurrent analysis runs for the same project (analysis is
// async I/O, not a child process, so a Set of project IDs suffices).
const activeAnalyses = new Set<string>();

// ------------------------------------------------------------------------------
// Window Management
// ------------------------------------------------------------------------------

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: WINDOW.WIDTH,
    height: WINDOW.HEIGHT,
    minWidth: WINDOW.MIN_WIDTH,
    minHeight: WINDOW.MIN_HEIGHT,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void loadRenderer();
  configureSecurityPolicy();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function loadRenderer(): Promise<void> {
  if (!mainWindow) return;

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

function configureSecurityPolicy(): void {
  if (!mainWindow) return;

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [CONTENT_SECURITY_POLICY],
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

/**
 * Returns the absolute path to the bundled transcriber binary.
 * In development, uses the built binary in assets/bin/ relative to the source tree.
 * In production, uses the binary bundled via extraResources.
 */
function getTranscriberPath(): string {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  const base = isDev
    ? path.join(__dirname, "../../assets/bin/transcriber")
    : path.join(process.resourcesPath, "assets", "bin", "transcriber");
  return process.platform === "win32" ? `${base}.exe` : base;
}

/**
 * Returns the absolute path to the bundled Whisper model directory.
 * In development, uses assets/models/whisper-base/ relative to the source tree.
 * In production, uses the model bundled via extraResources.
 */
function getModelPath(): string {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  if (isDev) {
    return path.join(__dirname, "../../assets/models/whisper-base");
  }
  return path.join(process.resourcesPath, "assets", "models", "whisper-base");
}

// ------------------------------------------------------------------------------
// Video Probing
// ------------------------------------------------------------------------------

async function probeVideoMetadata(videoPath: string): Promise<VideoMetadata> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    videoPath,
  ]);

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
        onProgress: sendProgress,
      });

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

    const child = spawn(transcriberPath, args, { detached: false });
    activeTranscriptions.set(projectId, child);

    // Parse stderr for PROGRESS: XX lines and forward them to the renderer
    let stderrBuffer = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
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
      child.on("exit", async (code) => {
        activeTranscriptions.delete(projectId);

        if (code !== 0) {
          database.prepare("UPDATE projects SET transcript_status = 'failed' WHERE id = ?").run(projectId);
          const exitMessage = `Transcription exited with code ${code ?? "unknown"}`;
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
}

// ------------------------------------------------------------------------------
// Application Lifecycle
// ------------------------------------------------------------------------------

app.whenReady().then(() => {
  db = initDatabase();
  createWindow();
  registerIpcHandlers();

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

// Ensure any running transcription child processes are terminated when the app quits
app.on("before-quit", () => {
  for (const [, child] of activeTranscriptions) {
    child.kill();
  }
});
