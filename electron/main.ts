import { access, constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { app, BrowserWindow, ipcMain } from "electron";
import Database from "better-sqlite3";
import type { CreateProjectInput, Project, VideoMetadata } from "../src/types/electron";
import { CONTENT_SECURITY_POLICY, IPC_CHANNELS, SUPPORTED_VIDEO_EXTENSIONS, WINDOW } from "../src/constants";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const execFileAsync = promisify(execFile);

let mainWindow: BrowserWindow | null = null;
let db: Database.Database | null = null;
let probeInProgress = false;

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

  return database;
}

function requireDatabase(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
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
        "SELECT id, video_path, title, duration_sec, width, height, fps, status, created_at FROM projects ORDER BY created_at DESC"
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
