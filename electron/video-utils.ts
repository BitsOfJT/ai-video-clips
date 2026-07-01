import { access, constants as fsConstants } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { SUPPORTED_VIDEO_EXTENSIONS } from "../src/constants.js";

const accessAsync = promisify(access);

export function parseFrameRate(rawRate: string): number {
  const [numPart, denPart] = rawRate.split("/");
  const num = Number(numPart) || 0;
  const den = denPart ? (Number(denPart) || 1) : 1;
  return den !== 0 ? num / den : 0;
}

export async function validateVideoPath(videoPath: string): Promise<string> {
  if (!path.isAbsolute(videoPath)) {
    throw new Error("Invalid video path");
  }

  const ext = path.extname(videoPath).toLowerCase();
  if (!SUPPORTED_VIDEO_EXTENSIONS.includes(ext)) {
    throw new Error("Unsupported video format");
  }

  const resolvedPath = path.resolve(videoPath);
  await accessAsync(resolvedPath, fsConstants.R_OK);

  return resolvedPath;
}
