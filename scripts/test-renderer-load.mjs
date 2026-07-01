/**
 * Electron main-process harness: load the production renderer HTML in a hidden
 * window and verify the React shell mounted.
 *
 * Invoked by scripts/test-packaged-renderer.js — not run directly.
 */
import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

delete process.env.ELECTRON_RUN_AS_NODE;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Keep in sync with electron/renderer-path.ts → getProductionRendererHtmlPath()
const htmlPath = path.join(repoRoot, "dist", "index.html");

const LOAD_TIMEOUT_MS = 30_000;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const timeout = setTimeout(() => {
    console.error(`[test-renderer-load] Timed out after ${LOAD_TIMEOUT_MS}ms`);
    app.exit(1);
  }, LOAD_TIMEOUT_MS);

  try {
    await win.loadFile(htmlPath);
    const title = await win.webContents.executeJavaScript("document.title");
    if (title !== "AI Video Clipper") {
      throw new Error(`Unexpected document.title: ${JSON.stringify(title)}`);
    }

    const hasRoot = await win.webContents.executeJavaScript(
      "!!document.getElementById('root')?.childElementCount"
    );
    if (!hasRoot) {
      throw new Error("React root did not mount (#root is empty)");
    }

    console.log("[test-renderer-load] Production renderer loaded successfully");
    clearTimeout(timeout);
    app.exit(0);
  } catch (err) {
    clearTimeout(timeout);
    console.error("[test-renderer-load] Failed:", err);
    app.exit(1);
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
