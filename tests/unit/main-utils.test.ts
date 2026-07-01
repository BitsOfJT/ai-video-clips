import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { parseFrameRate, validateVideoPath } from "../../electron/video-utils";
import {
  getTranscriberPath,
  getModelPath,
  getEditorPath,
  resolveFfmpegPath,
  resolveFfprobePath,
} from "../../electron/paths";

let tmpDir = "";

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-video-clips-test-"));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("parseFrameRate", () => {
  it("parses a standard fraction like 30000/1001", () => {
    expect(parseFrameRate("30000/1001")).toBeCloseTo(29.97, 1);
  });

  it("parses an integer numerator", () => {
    expect(parseFrameRate("60/1")).toBe(60);
  });

  it("handles missing denominator as 1", () => {
    expect(parseFrameRate("30")).toBe(30);
  });

  it("returns 0 for 0/1", () => {
    expect(parseFrameRate("0/1")).toBe(0);
  });
});

describe("validateVideoPath", () => {
  it("rejects a relative path", async () => {
    await expect(validateVideoPath("relative/path.mp4")).rejects.toThrow("Invalid video path");
  });

  it("rejects an unsupported extension", async () => {
    await expect(validateVideoPath("/absolute/path/file.txt")).rejects.toThrow(
      "Unsupported video format"
    );
  });

  it("accepts a real valid video file", async () => {
    const filePath = path.join(tmpDir, "test_video.mp4");
    await fs.writeFile(filePath, "fake video content");
    await expect(validateVideoPath(filePath)).resolves.toBe(filePath);
  });
});

describe("binary path helpers", () => {
  it("resolve dev transcriber path when VITE_DEV_SERVER_URL is set", () => {
    vi.stubEnv("VITE_DEV_SERVER_URL", "http://localhost:5173");
    expect(getTranscriberPath()).toMatch(/assets[\\/]bin[\\/]transcriber/);
  });

  it("resolve dev model path when VITE_DEV_SERVER_URL is set", () => {
    vi.stubEnv("VITE_DEV_SERVER_URL", "http://localhost:5173");
    expect(getModelPath()).toMatch(/assets[\\/]models[\\/]whisper-base/);
  });

  it("resolve dev editor path when VITE_DEV_SERVER_URL is set", () => {
    vi.stubEnv("VITE_DEV_SERVER_URL", "http://localhost:5173");
    expect(getEditorPath()).toMatch(/assets[\\/]bin[\\/]editor/);
  });

  it("falls back to ffmpeg on PATH when no override or bundle", () => {
    vi.stubEnv("VITE_DEV_SERVER_URL", "http://localhost:5173");
    expect(resolveFfmpegPath(null)).toBe("ffmpeg");
    expect(resolveFfprobePath(null)).toBe("ffprobe");
  });
});
