#!/usr/bin/env node
/**
 * Downloads static FFmpeg + FFprobe binaries for the current platform into
 * assets/ffmpeg/{macos|windows}/. Used by build:release and CI before packaging.
 *
 * Sources:
 *   macOS  — https://evermeet.cx/ffmpeg/ (LGPL builds, no affiliation)
 *   Windows — https://www.gyan.dev/ffmpeg/builds/ (essentials, GPL)
 */

import { execSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, chmodSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PLATFORM_DIR = process.platform === "win32" ? "windows" : "macos";
const OUT_DIR = join(ROOT, "assets", "ffmpeg", PLATFORM_DIR);

const MAC_FFMPEG_URL = "https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip";
const MAC_FFPROBE_URL = "https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip";
const WIN_FFMPEG_URL =
  "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";

async function download(url, destPath) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Download failed (${response.status}): ${url}`);
    }
    if (!response.body) {
      throw new Error(`Empty response body: ${url}`);
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(destPath));
  } finally {
    clearTimeout(timeout);
  }
}

function unzipMac(zipPath, destDir) {
  execSync(`unzip -o -j "${zipPath}" -d "${destDir}"`, { stdio: "inherit" });
}

function unzipWindows(zipPath, destDir) {
  const ps = `
    $dest = "${destDir.replace(/\\/g, "\\\\")}"
    $zip = "${zipPath.replace(/\\/g, "\\\\")}"
    $tmp = Join-Path $env:TEMP ("ffmpeg-extract-" + [guid]::NewGuid())
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $bin = Get-ChildItem -Path $tmp -Recurse -Filter ffmpeg.exe | Select-Object -First 1
    $probe = Get-ChildItem -Path $tmp -Recurse -Filter ffprobe.exe | Select-Object -First 1
    if (-not $bin) { throw "ffmpeg.exe not found in archive" }
    Copy-Item $bin.FullName (Join-Path $dest "ffmpeg.exe") -Force
    if ($probe) { Copy-Item $probe.FullName (Join-Path $dest "ffprobe.exe") -Force }
    Remove-Item $tmp -Recurse -Force
  `;
  const command = ps
    .trim()
    .split(/\s*\n\s*/)
    .filter(Boolean)
    .join("; ");
  execSync(`powershell -NoProfile -Command "${command.replace(/"/g, '\\"')}"`, {
    stdio: "inherit",
  });
}

async function downloadMac() {
  mkdirSync(OUT_DIR, { recursive: true });

  // Prefer Homebrew when available (faster and more reliable than evermeet.cx).
  try {
    const prefix = execSync("brew --prefix", { encoding: "utf8" }).trim();
    const ffmpegSrc = join(prefix, "bin", "ffmpeg");
    const ffprobeSrc = join(prefix, "bin", "ffprobe");
    if (existsSync(ffmpegSrc) && existsSync(ffprobeSrc)) {
      copyFileSync(ffmpegSrc, join(OUT_DIR, "ffmpeg"));
      copyFileSync(ffprobeSrc, join(OUT_DIR, "ffprobe"));
      chmodSync(join(OUT_DIR, "ffmpeg"), 0o755);
      chmodSync(join(OUT_DIR, "ffprobe"), 0o755);
      console.log(`[download-ffmpeg] Copied Homebrew FFmpeg into ${OUT_DIR}`);
      return;
    }
  } catch {
    // Fall through to static download.
  }

  const ffmpegZip = join(OUT_DIR, "ffmpeg.zip");
  const ffprobeZip = join(OUT_DIR, "ffprobe.zip");

  console.log("[download-ffmpeg] Fetching macOS ffmpeg...");
  await download(MAC_FFMPEG_URL, ffmpegZip);
  unzipMac(ffmpegZip, OUT_DIR);

  console.log("[download-ffmpeg] Fetching macOS ffprobe...");
  await download(MAC_FFPROBE_URL, ffprobeZip);
  unzipMac(ffprobeZip, OUT_DIR);

  for (const name of ["ffmpeg", "ffprobe"]) {
    const binPath = join(OUT_DIR, name);
    if (!existsSync(binPath)) {
      throw new Error(`Expected binary missing after extract: ${binPath}`);
    }
    chmodSync(binPath, 0o755);
  }

  console.log(`[download-ffmpeg] macOS binaries ready in ${OUT_DIR}`);
}

async function downloadWindows() {
  mkdirSync(OUT_DIR, { recursive: true });
  const zipPath = join(OUT_DIR, "ffmpeg-essentials.zip");

  console.log("[download-ffmpeg] Fetching Windows ffmpeg essentials...");
  await download(WIN_FFMPEG_URL, zipPath);
  unzipWindows(zipPath, OUT_DIR);

  const ffmpegExe = join(OUT_DIR, "ffmpeg.exe");
  if (!existsSync(ffmpegExe)) {
    throw new Error(`Expected binary missing after extract: ${ffmpegExe}`);
  }

  console.log(`[download-ffmpeg] Windows binaries ready in ${OUT_DIR}`);
}

async function main() {
  if (process.platform === "darwin") {
    await downloadMac();
  } else if (process.platform === "win32") {
    await downloadWindows();
  } else {
    console.log(
      `[download-ffmpeg] Skipping download on ${process.platform} — use system FFmpeg in dev.`
    );
  }
}

main().catch((err) => {
  console.error("[download-ffmpeg] Failed:", err.message);
  process.exit(1);
});
