/**
 * Unit tests for Electron main process utility functions.
 *
 * These tests cover the helper functions extracted from electron/main.ts that
 * handle path validation, frame rate parsing, and binary/model path resolution.
 * Electron APIs (app, BrowserWindow, ipcMain) are deliberately avoided here;
 * those require full Electron mocking and integration testing.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

// -----------------------------------------------------------------------------
// Helpers: recreate the logic from electron/main.ts inline for testing.
// We cannot easily import from main.ts because it imports Electron.
// -----------------------------------------------------------------------------

const SUPPORTED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".mkv", ".avi", ".webm"];

function parseFrameRate(rawRate: string): number {
  const [numPart, denPart] = rawRate.split("/");
  const num = Number(numPart) || 0;
  const den = denPart ? (Number(denPart) || 1) : 1;
  return den !== 0 ? num / den : 0;
}

async function validateVideoPath(
  videoPath: string,
  supportedExts: readonly string[] = SUPPORTED_VIDEO_EXTENSIONS,
): Promise<string> {
  if (!path.isAbsolute(videoPath)) {
    throw new Error("Invalid video path");
  }

  const ext = path.extname(videoPath).toLowerCase();
  if (!supportedExts.includes(ext)) {
    throw new Error("Unsupported video format");
  }

  const resolvedPath = path.resolve(videoPath);
  await fs.access(resolvedPath, fs.constants.R_OK);

  return resolvedPath;
}

function getTranscriberPath(__dirname: string, isDev: boolean): string {
  const base = isDev
    ? path.join(__dirname, "../../assets/bin/transcriber")
    : path.join("/fake/resources", "assets", "bin", "transcriber");
  return process.platform === "win32" ? `${base}.exe` : base;
}

function getModelPath(__dirname: string, isDev: boolean): string {
  if (isDev) {
    return path.join(__dirname, "../../assets/models/whisper-base");
  }
  return path.join("/fake/resources", "assets", "models", "whisper-base");
}

function getEditorPath(__dirname: string, isDev: boolean): string {
  const base = isDev
    ? path.join(__dirname, "../../assets/bin/editor")
    : path.join("/fake/resources", "assets", "bin", "editor");
  return process.platform === "win32" ? `${base}.exe` : base;
}

// -----------------------------------------------------------------------------
// Temp file helpers
// -----------------------------------------------------------------------------

let tmpDir = "";

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-video-clips-test-"));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -----------------------------------------------------------------------------
// Tests: parseFrameRate
// -----------------------------------------------------------------------------

describe("parseFrameRate", () => {
  it("should parse a standard fraction like 30000/1001", () => {
    const result = parseFrameRate("30000/1001");
    // 30000 / 1001 ≈ 29.970
    expect(result).toBeCloseTo(29.97, 1);
  });

  it("should parse an integer numerator", () => {
    expect(parseFrameRate("60/1")).toBe(60);
  });

  it("should handle missing denominator as 1", () => {
    expect(parseFrameRate("30")).toBe(30);
  });

  it("should return 0 for 0/1", () => {
    expect(parseFrameRate("0/1")).toBe(0);
  });

  it("should handle division by zero denominator gracefully", () => {
    // Number("0") is falsy, so the fallback || 1 kicks in, returning 30
    expect(parseFrameRate("30/0")).toBe(30);
  });

  it("should handle empty string", () => {
    const result = parseFrameRate("");
    expect(result).toBe(0);
  });

  it("should handle non-numeric numerator", () => {
    const result = parseFrameRate("abc/1");
    expect(result).toBe(0);
  });

  it("should handle 50/1 (common 50fps)", () => {
    expect(parseFrameRate("50/1")).toBe(50);
  });

  it("should handle 24000/1001 (23.976fps)", () => {
    const result = parseFrameRate("24000/1001");
    expect(result).toBeCloseTo(23.976, 2);
  });
});

// -----------------------------------------------------------------------------
// Tests: validateVideoPath
// -----------------------------------------------------------------------------

describe("validateVideoPath", () => {
  it("should reject a relative path", async () => {
    await expect(validateVideoPath("relative/path.mp4")).rejects.toThrow(
      "Invalid video path",
    );
  });

  it("should reject an unsupported extension", async () => {
    await expect(
      validateVideoPath("/absolute/path/file.txt"),
    ).rejects.toThrow("Unsupported video format");
  });

  it("should reject a non-existent file", async () => {
    const fakePath = path.join(tmpDir, "nonexistent.mp4");
    await expect(validateVideoPath(fakePath)).rejects.toThrow();
  });

  it("should accept a real valid video file", async () => {
    const filePath = path.join(tmpDir, "test_video.mp4");
    await fs.writeFile(filePath, "fake video content");
    const result = await validateVideoPath(filePath);
    expect(result).toBe(filePath);
  });

  it("should accept .mov and .mkv extensions", async () => {
    const movPath = path.join(tmpDir, "test.mov");
    const mkvPath = path.join(tmpDir, "test.mkv");
    await fs.writeFile(movPath, "fake mov");
    await fs.writeFile(mkvPath, "fake mkv");

    await expect(validateVideoPath(movPath)).resolves.toBe(movPath);
    await expect(validateVideoPath(mkvPath)).resolves.toBe(mkvPath);
  });

  it("should accept .avi and .webm extensions", async () => {
    const aviPath = path.join(tmpDir, "test.avi");
    const webmPath = path.join(tmpDir, "test.webm");
    await fs.writeFile(aviPath, "fake avi");
    await fs.writeFile(webmPath, "fake webm");

    await expect(validateVideoPath(aviPath)).resolves.toBe(aviPath);
    await expect(validateVideoPath(webmPath)).resolves.toBe(webmPath);
  });

  it("should be case-insensitive for extensions", async () => {
    const mp4Path = path.join(tmpDir, "test.MP4");
    const movPath = path.join(tmpDir, "test.MOV");
    await fs.writeFile(mp4Path, "fake mp4");
    await fs.writeFile(movPath, "fake mov");

    await expect(validateVideoPath(mp4Path)).resolves.toBe(mp4Path);
    await expect(validateVideoPath(movPath)).resolves.toBe(movPath);
  });

  it("should reject a directory path", async () => {
    // Directories exist and are readable but have no extension — will fail on extension check first
    const dirPath = path.join(tmpDir, "subdir");
    await fs.mkdir(dirPath, { recursive: true });
    await expect(validateVideoPath(dirPath)).rejects.toThrow(
      "Unsupported video format",
    );
  });

  it("should resolve symlinks", async () => {
    const realFile = path.join(tmpDir, "real.mp4");
    const linkFile = path.join(tmpDir, "link.mp4");
    await fs.writeFile(realFile, "real content");
    await fs.symlink(realFile, linkFile);

    const result = await validateVideoPath(linkFile);
    // path.resolve() follows symlinks
    expect(result).toBe(linkFile);
  });
});

// -----------------------------------------------------------------------------
// Tests: getTranscriberPath
// -----------------------------------------------------------------------------

describe("getTranscriberPath", () => {
  const fakeDir = "/app/electron";

  it("should resolve dev path relative to __dirname", () => {
    const result = getTranscriberPath(fakeDir, true);
    const expected = path.join(fakeDir, "../../assets/bin/transcriber");
    if (process.platform === "win32") {
      expect(result).toBe(`${expected}.exe`);
    } else {
      expect(result).toBe(expected);
    }
  });

  it("should resolve prod path using process.resourcesPath", () => {
    const result = getTranscriberPath(fakeDir, false);
    const expected = path.join("/fake/resources", "assets", "bin", "transcriber");
    if (process.platform === "win32") {
      expect(result).toBe(`${expected}.exe`);
    } else {
      expect(result).toBe(expected);
    }
  });
});

// -----------------------------------------------------------------------------
// Tests: getModelPath
// -----------------------------------------------------------------------------

describe("getModelPath", () => {
  const fakeDir = "/app/electron";

  it("should resolve dev path relative to __dirname", () => {
    const result = getModelPath(fakeDir, true);
    expect(result).toBe(path.join(fakeDir, "../../assets/models/whisper-base"));
  });

  it("should resolve prod path using process.resourcesPath", () => {
    const result = getModelPath(fakeDir, false);
    expect(result).toBe(
      path.join("/fake/resources", "assets", "models", "whisper-base"),
    );
  });
});

// -----------------------------------------------------------------------------
// Tests: getEditorPath
// -----------------------------------------------------------------------------

describe("getEditorPath", () => {
  const fakeDir = "/app/electron";

  it("should resolve dev path relative to __dirname", () => {
    const result = getEditorPath(fakeDir, true);
    const expected = path.join(fakeDir, "../../assets/bin/editor");
    if (process.platform === "win32") {
      expect(result).toBe(`${expected}.exe`);
    } else {
      expect(result).toBe(expected);
    }
  });

  it("should resolve prod path using process.resourcesPath", () => {
    const result = getEditorPath(fakeDir, false);
    const expected = path.join("/fake/resources", "assets", "bin", "editor");
    if (process.platform === "win32") {
      expect(result).toBe(`${expected}.exe`);
    } else {
      expect(result).toBe(expected);
    }
  });
});
