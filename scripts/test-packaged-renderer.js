#!/usr/bin/env node

/**
 * Smoke test: verify the production renderer HTML exists at the path the main
 * process uses, then launch Electron headlessly to confirm it loads.
 *
 * Prerequisites:
 *   - `npx vite build` (or `npm run build` without electron-builder)
 *
 * Usage: node scripts/test-packaged-renderer.js
 */

import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
// Production renderer path: dist/index.html under app root
const htmlPath = path.join(repoRoot, "dist", "index.html");
const legacyWrongPath = path.join(repoRoot, "dist-electron", "renderer", "index.html");

async function assertExists(filePath, label) {
  try {
    await access(filePath);
    console.log(`[test-packaged-renderer] OK: ${label} exists at ${filePath}`);
  } catch {
    console.error(`[test-packaged-renderer] FAIL: ${label} missing at ${filePath}`);
    process.exit(1);
  }
}

async function assertMissing(filePath, label) {
  try {
    await access(filePath);
    console.error(`[test-packaged-renderer] FAIL: ${label} should not exist at ${filePath}`);
    process.exit(1);
  } catch {
    console.log(`[test-packaged-renderer] OK: ${label} is absent (expected)`);
  }
}

async function assertBundledAssets() {
  const html = await readFile(htmlPath, "utf-8");
  const scriptMatch = html.match(/src="(\.\/assets\/[^"]+\.js)"/);
  const styleMatch = html.match(/href="(\.\/assets\/[^"]+\.css)"/);

  if (!scriptMatch || !styleMatch) {
    console.error("[test-packaged-renderer] FAIL: dist/index.html missing bundled asset references");
    process.exit(1);
  }

  await assertExists(path.join(repoRoot, "dist", scriptMatch[1].replace(/^\.\//, "")), "bundled JS");
  await assertExists(path.join(repoRoot, "dist", styleMatch[1].replace(/^\.\//, "")), "bundled CSS");
}

function getElectronLaunchCommand() {
  const electronBin =
    process.platform === "win32"
      ? path.join(repoRoot, "node_modules", ".bin", "electron.cmd")
      : path.join(repoRoot, "node_modules", ".bin", "electron");

  const electronArgs = [
    // Required on Linux CI runners (SUID sandbox is not configured in GHA).
    "--no-sandbox",
    path.join(repoRoot, "scripts", "test-renderer-load.mjs"),
  ];

  // GitHub Actions ubuntu-latest has no $DISPLAY; xvfb provides a virtual X server.
  if (process.platform === "linux" && !process.env.DISPLAY) {
    return {
      command: "xvfb-run",
      args: ["-a", electronBin, ...electronArgs],
    };
  }

  return { command: electronBin, args: electronArgs };
}

function runElectronLoadTest() {
  return new Promise((resolve, reject) => {
    const { command, args } = getElectronLaunchCommand();

    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.VITE_DEV_SERVER_URL;

    const child = spawn(command, args, {
      cwd: repoRoot,
      env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Electron renderer load test exited with code ${code}`));
      }
    });
  });
}

async function main() {
  console.log("[test-packaged-renderer] Verifying production renderer artifacts…");
  await assertExists(htmlPath, "production renderer HTML");
  await assertMissing(legacyWrongPath, "legacy renderer path");
  await assertBundledAssets();

  console.log("[test-packaged-renderer] Launching headless Electron load test…");
  await runElectronLoadTest();
  console.log("[test-packaged-renderer] All checks passed");
}

main().catch((err) => {
  console.error("[test-packaged-renderer] FAIL:", err);
  process.exit(1);
});
