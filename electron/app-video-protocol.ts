import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type Database from "better-sqlite3";
import { net, protocol } from "electron";
import { SUPPORTED_VIDEO_EXTENSIONS } from "../src/constants.js";
import { filePathFromAppVideoUrl } from "../src/lib/app-video-url.js";

/** Must run before app.ready — enables <video> streaming on app-video:// */
let appVideoSchemeRegistered = false;
export function registerAppVideoScheme(): void {
  if (appVideoSchemeRegistered) return;
  appVideoSchemeRegistered = true;
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "app-video",
      privileges: {
        standard: true,
        secure: true,
        bypassCSP: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
}

/** Delegate byte-range handling to Chromium's native file:// fetch. */
async function serveVideoFile(resolvedPath: string, request: Request): Promise<Response> {
  const fileUrl = pathToFileURL(resolvedPath).href;
  return net.fetch(fileUrl, {
    method: request.method,
    headers: request.headers,
  });
}

let appVideoHandlerRegistered = false;
export function registerAppVideoHandler(getDb: () => Database.Database | null): void {
  if (appVideoHandlerRegistered) return;
  appVideoHandlerRegistered = true;

  protocol.handle("app-video", async (request) => {
    let filePath: string;
    try {
      filePath = filePathFromAppVideoUrl(request.url);
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    if (!path.isAbsolute(filePath) || filePath.includes("..")) {
      return new Response("Forbidden", { status: 403 });
    }

    const ext = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_VIDEO_EXTENSIONS.includes(ext)) {
      return new Response("Forbidden", { status: 403 });
    }

    const resolvedPath = path.resolve(filePath);
    if (resolvedPath !== filePath) {
      return new Response("Forbidden", { status: 403 });
    }

    try {
      await access(resolvedPath, fsConstants.R_OK);
    } catch {
      return new Response("Not found", { status: 404 });
    }

    const db = getDb();
    if (!db) {
      return new Response("Service unavailable", { status: 503 });
    }

    const row =
      process.platform === "darwin"
        ? (db
            .prepare("SELECT id FROM projects WHERE video_path = ? OR lower(video_path) = lower(?)")
            .get(resolvedPath, resolvedPath) as { id: string } | undefined)
        : (db.prepare("SELECT id FROM projects WHERE video_path = ?").get(resolvedPath) as
            | { id: string }
            | undefined);
    if (!row) {
      return new Response("Forbidden", { status: 403 });
    }

    try {
      return await serveVideoFile(resolvedPath, request);
    } catch {
      return new Response("Internal error", { status: 500 });
    }
  });
}
