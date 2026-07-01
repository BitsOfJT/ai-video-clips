import { execFileAsync } from "../exec";

/** Max bytes for a single piped JPEG frame (downscaled frames are well under this). */
const FRAME_MAX_BUFFER = 20 * 1024 * 1024;

/**
 * Extract `count` evenly-spaced keyframes from the [startMs, endMs] window of a
 * video as base64-encoded JPEGs (no data: prefix), for the AI vision pass.
 * Frames are downscaled to keep request payloads small. Reuses the on-PATH
 * FFmpeg binary (same assumption as ffprobe elsewhere in the app).
 *
 * Frame extraction is best-effort: if FFmpeg fails for a given timestamp, that
 * frame is skipped rather than failing the whole analysis.
 */
export async function extractKeyframes(
  videoPath: string,
  startMs: number,
  endMs: number,
  count = 3,
  scaleWidth = 512,
  ffmpegPath = "ffmpeg"
): Promise<string[]> {
  const startSec = startMs / 1000;
  const durationSec = Math.max(0, (endMs - startMs) / 1000);
  const frames: string[] = [];

  for (let i = 0; i < count; i++) {
    // Sample at the midpoint of each of `count` equal sub-windows.
    const fraction = (i + 0.5) / count;
    const ts = startSec + fraction * durationSec;

    try {
      const { stdout } = await execFileAsync(
        ffmpegPath,
        [
          "-ss", ts.toFixed(3),
          "-i", videoPath,
          "-frames:v", "1",
          "-vf", `scale=${scaleWidth}:-2`,
          "-f", "image2",
          "-c:v", "mjpeg",
          "-q:v", "5",
          "pipe:1",
        ],
        { encoding: "buffer", maxBuffer: FRAME_MAX_BUFFER }
      );

      if (stdout && stdout.length > 0) {
        frames.push(Buffer.from(stdout).toString("base64"));
      }
    } catch {
      // Skip unreadable timestamps (e.g. past EOF); continue with remaining frames.
    }
  }

  return frames;
}
