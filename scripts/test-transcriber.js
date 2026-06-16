#!/usr/bin/env node

/**
 * End-to-end smoke test for the transcription pipeline.
 *
 * This script:
 *   1. Creates a short silent test video with FFmpeg (lavfi testsrc + sine wave).
 *   2. Runs the transcriber binary with the bundled model.
 *   3. Verifies the output JSON has a "segments" array.
 *   4. Cleans up all temp files.
 *
 * Usage: node scripts/test-transcriber.js
 *
 * Prerequisites:
 *   - FFmpeg and FFprobe installed and in PATH.
 *   - Transcriber binary built at assets/bin/transcriber.
 *   - Whisper model downloaded at assets/models/whisper-base/.
 *
 * The test may take 10-30 seconds depending on the model size and CPU speed.
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const transcriberBin = path.join(repoRoot, "assets", "bin", "transcriber");
const modelDir = path.join(repoRoot, "assets", "models", "whisper-base");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run a command with the given arguments, returning { stdout, stderr, exitCode }.
 */
function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code });
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn ${cmd}: ${err.message}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("🧪 Starting transcription pipeline smoke test...\n");

  // 1. Verify prerequisites exist.
  const fs = await import("node:fs");
  if (!fs.existsSync(transcriberBin)) {
    console.error(`❌ Transcriber binary not found at: ${transcriberBin}`);
    console.error("   Run 'npm run build:python' first.");
    process.exit(1);
  }
  console.log(`✅ Transcriber binary found: ${transcriberBin}`);

  if (!fs.existsSync(modelDir)) {
    console.error(`❌ Model directory not found at: ${modelDir}`);
    console.error("   Run 'npm run download:models' first.");
    process.exit(1);
  }
  console.log(`✅ Model directory found: ${modelDir}`);
  console.log(`   Model contents: ${fs.readdirSync(modelDir).join(", ")}`);

  // 2. Create a temp directory for test artifacts.
  const tmpDir = await mkdtemp(
    path.join(repoRoot, "tmp-transcriber-test-"),
  );
  console.log(`\n📁 Temp directory: ${tmpDir}`);

  // 3. Generate a short test video with FFmpeg.
  //    Use lavfi testsrc (video pattern) + sine (audio tone) for deterministic output.
  const testVideoPath = path.join(tmpDir, "test-video.mp4");
  console.log("\n🎬 Generating test video with FFmpeg...");

  const { stdout: ffmpegOut, stderr: ffmpegErr, exitCode: ffmpegCode } = await runCommand(
    "ffmpeg",
    [
      "-f", "lavfi",
      "-i", "testsrc=duration=5:size=320x240:rate=24",
      "-f", "lavfi",
      "-i", "sine=frequency=440:duration=5",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "35",
      "-c:a", "aac",
      "-shortest",
      "-y",
      testVideoPath,
    ],
    { timeout: 30_000 },
  );

  if (ffmpegCode !== 0) {
    console.error(`❌ FFmpeg failed (exit code ${ffmpegCode}):`);
    console.error(ffmpegErr);
    await rm(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }
  console.log(`✅ Test video created: ${testVideoPath}`);

  // 4. Run the transcriber binary.
  const outputJsonPath = path.join(tmpDir, "transcript-output.json");
  console.log("\n🔊 Running transcriber... (this may take 10-30 seconds)");

  const startTime = Date.now();

  const transcriberArgs = [
    "--video-path", testVideoPath,
    "--model-dir", modelDir,
    "--output-json", outputJsonPath,
  ];

  const { stdout: trOut, stderr: trErr, exitCode: trCode } = await runCommand(
    transcriberBin,
    transcriberArgs,
    { timeout: 300_000 }, // 5-minute generous timeout for CPU transcription
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`⏱  Transcriber finished in ${elapsed}s (exit code: ${trCode})`);

  // Print any PROGRESS lines from stderr for diagnostic purposes.
  const progressLines = trErr
    .split("\n")
    .filter((line) => line.startsWith("PROGRESS:"));
  if (progressLines.length > 0) {
    console.log(`📊 Progress updates: ${progressLines.length} emitted`);
    const first = progressLines[0];
    const last = progressLines[progressLines.length - 1];
    console.log(`   First: ${first}`);
    console.log(`   Last:  ${last}`);
  }

  if (trCode !== 0) {
    console.error(`❌ Transcriber failed with exit code ${trCode}`);
    console.error(`   stderr: ${trErr.slice(0, 500)}`);
    await rm(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }

  // 5. Read and validate the output JSON.
  console.log("\n📝 Validating output JSON...");

  let transcript;
  try {
    const rawJson = await readFile(outputJsonPath, "utf-8");
    transcript = JSON.parse(rawJson);
  } catch (err) {
    console.error(`❌ Failed to read/parse output JSON: ${err.message}`);
    await rm(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }

  // Validate structure: must have a "segments" array.
  if (!transcript || !Array.isArray(transcript.segments)) {
    console.error('❌ Output JSON missing "segments" array');
    console.error(`   Raw keys: ${Object.keys(transcript || {}).join(", ")}`);
    await rm(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }

  console.log(`✅ Transcript has ${transcript.segments.length} segment(s)`);

  // Validate segment structure (if any segments exist).
  if (transcript.segments.length > 0) {
    const first = transcript.segments[0];
    const requiredFields = ["id", "start", "end", "text", "words"];
    for (const field of requiredFields) {
      if (!(field in first)) {
        console.error(`❌ First segment missing required field: "${field}"`);
        await rm(tmpDir, { recursive: true, force: true });
        process.exit(1);
      }
    }

    // Validate word-level timestamps on the first segment.
    if (first.words && first.words.length > 0) {
      const firstWord = first.words[0];
      const wordFields = ["start", "end", "word", "probability"];
      for (const field of wordFields) {
        if (!(field in firstWord)) {
          console.error(`❌ First word missing required field: "${field}"`);
          await rm(tmpDir, { recursive: true, force: true });
          process.exit(1);
        }
      }
      console.log(`✅ Word-level timestamps present (${first.words.length} words in first segment)`);
    }

    // Check that segment timing is within the video duration (5 seconds with some tolerance).
    const videoEnd = transcript.segments.reduce(
      (max, seg) => Math.max(max, seg.end),
      0,
    );
    console.log(`📐 Total transcript span: ${videoEnd.toFixed(2)}s`);

    if (videoEnd > 6.0) {
      console.warn(`⚠️  Transcript end (${videoEnd.toFixed(2)}s) exceeds video duration (5s) - this may indicate an issue`);
    }
  }

  // 6. Cleanup.
  console.log("\n🧹 Cleaning up temp files...");
  await rm(tmpDir, { recursive: true, force: true });
  console.log("✅ Cleanup complete");

  // 7. Report success.
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ TRANSCRIPTION PIPELINE SMOKE TEST PASSED");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`   Segments:    ${transcript.segments.length}`);
  console.log(`   Duration:    ${elapsed}s`);
  console.log(`   Output:      ${outputJsonPath}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n❌ Smoke test failed with unexpected error:`);
  console.error(err);
  process.exit(1);
});
