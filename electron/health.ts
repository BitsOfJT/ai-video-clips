import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import type Database from "better-sqlite3";
import type { SystemHealthCheck, SystemHealthItem } from "../src/types/electron";
import { OLLAMA_DEFAULTS } from "../src/constants";
import { getSettings } from "./settings";
import {
  getEditorPath,
  getModelPath,
  getTranscriberPath,
  resolveFfmpegPath,
} from "./paths";
import { execFileAsync } from "./exec";

async function pathReadable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function checkBinary(label: string, filePath: string): Promise<SystemHealthItem> {
  if (!(await pathReadable(filePath))) {
    return {
      ok: false,
      label,
      path: filePath,
      message: `Binary not found. Reinstall the app or run a release build.`,
    };
  }
  return { ok: true, label, path: filePath };
}

async function checkDirectory(label: string, dirPath: string): Promise<SystemHealthItem> {
  if (!(await pathReadable(dirPath))) {
    return {
      ok: false,
      label,
      path: dirPath,
      message: `Model directory not found. Reinstall the app.`,
    };
  }
  return { ok: true, label, path: dirPath };
}

async function checkFfmpeg(ffmpegPath: string): Promise<SystemHealthItem> {
  if (!ffmpegPath) {
    return {
      ok: false,
      label: "FFmpeg",
      path: "",
      message: "FFmpeg not configured. Install FFmpeg or set a custom path in Settings.",
    };
  }

  try {
    const { stdout } = await execFileAsync(ffmpegPath, ["-version"]);
    if (!stdout.includes("ffmpeg")) {
      return {
        ok: false,
        label: "FFmpeg",
        path: ffmpegPath,
        message: "FFmpeg binary did not respond as expected.",
      };
    }
    return { ok: true, label: "FFmpeg", path: ffmpegPath };
  } catch {
    return {
      ok: false,
      label: "FFmpeg",
      path: ffmpegPath,
      message: "FFmpeg is not executable. Check Settings or reinstall the app.",
    };
  }
}

async function checkOllama(
  baseUrl: string,
  textModel: string,
  visionModel: string
): Promise<SystemHealthItem & { models?: string[] }> {
  const trimmed = (baseUrl ?? "").trim() || OLLAMA_DEFAULTS.baseUrl;

  let normalized: string;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("invalid protocol");
    }
    normalized = `${parsed.protocol}//${parsed.host}`;
  } catch {
    return {
      ok: false,
      label: "Ollama",
      path: trimmed,
      message: "Invalid Ollama URL. Fix it in Settings.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${normalized}/api/tags`, { signal: controller.signal });
    if (!response.ok) {
      return {
        ok: false,
        label: "Ollama",
        path: normalized,
        message: `Ollama returned HTTP ${response.status}. Is the daemon running?`,
      };
    }

    const json = (await response.json().catch(() => ({}))) as {
      models?: Array<{ name?: string; model?: string }>;
    };
    const models = Array.isArray(json.models)
      ? json.models.map((m) => m.name ?? m.model ?? "").filter(Boolean)
      : [];

    const hasText = models.some(
      (m) => m === textModel || m.startsWith(`${textModel}:`) || m.startsWith(`${textModel}-`)
    );
    const hasVision = models.some(
      (m) =>
        m === visionModel ||
        m.startsWith(`${visionModel}:`) ||
        m.startsWith(`${visionModel}-`)
    );

    if (!hasText || !hasVision) {
      const missing: string[] = [];
      if (!hasText) missing.push(`ollama pull ${textModel}`);
      if (!hasVision) missing.push(`ollama pull ${visionModel}`);
      return {
        ok: false,
        label: "Ollama",
        path: normalized,
        message: `Missing models. Run: ${missing.join(" && ")}`,
        models,
      };
    }

    return { ok: true, label: "Ollama", path: normalized, models };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Ollama request timed out. Start Ollama and try again."
        : "Cannot reach Ollama. Install from https://ollama.com and start the app.";
    return { ok: false, label: "Ollama", path: normalized, message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runSystemHealthCheck(db: Database.Database): Promise<SystemHealthCheck> {
  const settings = getSettings(db);
  const transcriber = await checkBinary("Transcriber", getTranscriberPath());
  const editor = await checkBinary("Editor", getEditorPath());
  const whisperModel = await checkDirectory("Whisper model", getModelPath());
  const ffmpeg = await checkFfmpeg(resolveFfmpegPath(settings.ffmpegPath));

  const checks: SystemHealthItem[] = [transcriber, editor, whisperModel, ffmpeg];

  if (settings.provider === "ollama") {
    const ollama = await checkOllama(
      settings.ollamaBaseUrl,
      settings.ollamaTextModel,
      settings.ollamaVisionModel
    );
    checks.push(ollama);
  } else if (!settings.hasGeminiKey) {
    checks.push({
      ok: false,
      label: "Gemini API key",
      path: "",
      message: "Add a Gemini API key in Settings or switch to Ollama.",
    });
  } else {
    checks.push({
      ok: true,
      label: "Gemini API key",
      path: "",
      message: "API key stored (not verified until first analysis).",
    });
  }

  const ready = checks.every((c) => c.ok);

  return { ready, checks };
}
