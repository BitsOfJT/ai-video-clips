import { safeStorage } from "electron";
import type Database from "better-sqlite3";
import type { AppSettings, UpdateSettingsInput, AIProvider } from "../src/types/electron";
import { AI_PROVIDERS, OLLAMA_DEFAULTS } from "../src/constants";

/**
 * Settings are persisted in the key/value `settings` table. The Gemini API key
 * is the only sensitive value: it is encrypted with Electron `safeStorage`
 * (OS keychain-backed) before being written, and is NEVER returned to the
 * renderer — only `hasGeminiKey` is exposed.
 */

const KEYS = {
  provider: "provider",
  geminiApiKey: "gemini_api_key", // stored encrypted, prefixed (see encode/decode)
  ollamaBaseUrl: "ollama_base_url",
  ollamaTextModel: "ollama_text_model",
  ollamaVisionModel: "ollama_vision_model",
  ffmpegPath: "ffmpeg_path",
} as const;

const ENC_PREFIX = "enc:";
const PLAIN_PREFIX = "plain:";

function readRaw(db: Database.Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function writeRaw(db: Database.Database, key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

/** Encrypt a secret for storage. Falls back to plaintext (with a warning) only when the OS keychain is unavailable. */
function encodeSecret(plaintext: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return ENC_PREFIX + safeStorage.encryptString(plaintext).toString("base64");
  }
  console.warn(
    "safeStorage encryption is unavailable on this system; storing API key without OS encryption."
  );
  return PLAIN_PREFIX + Buffer.from(plaintext, "utf-8").toString("base64");
}

function decodeSecret(stored: string | null): string | null {
  if (!stored) return null;
  if (stored.startsWith(ENC_PREFIX)) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice(ENC_PREFIX.length), "base64"));
    } catch {
      return null;
    }
  }
  if (stored.startsWith(PLAIN_PREFIX)) {
    return Buffer.from(stored.slice(PLAIN_PREFIX.length), "base64").toString("utf-8");
  }
  return null;
}

function normalizeProvider(value: string | null): AIProvider {
  return (AI_PROVIDERS as readonly string[]).includes(value ?? "")
    ? (value as AIProvider)
    : "ollama"; // default to the fully-local, no-key provider
}

/** Returns settings safe to send to the renderer (no secret material). */
export function getSettings(db: Database.Database): AppSettings {
  return {
    provider: normalizeProvider(readRaw(db, KEYS.provider)),
    hasGeminiKey: decodeSecret(readRaw(db, KEYS.geminiApiKey)) !== null,
    ollamaBaseUrl: readRaw(db, KEYS.ollamaBaseUrl) ?? OLLAMA_DEFAULTS.baseUrl,
    ollamaTextModel: readRaw(db, KEYS.ollamaTextModel) ?? OLLAMA_DEFAULTS.textModel,
    ollamaVisionModel: readRaw(db, KEYS.ollamaVisionModel) ?? OLLAMA_DEFAULTS.visionModel,
    ffmpegPath: readRaw(db, KEYS.ffmpegPath) ?? "",
  };
}

/** Applies a partial update and returns the renderer-safe settings. */
export function updateSettings(db: Database.Database, input: UpdateSettingsInput): AppSettings {
  if (input.provider !== undefined) {
    writeRaw(db, KEYS.provider, normalizeProvider(input.provider));
  }
  if (input.geminiApiKey !== undefined) {
    const trimmed = input.geminiApiKey.trim();
    if (trimmed === "") {
      db.prepare("DELETE FROM settings WHERE key = ?").run(KEYS.geminiApiKey);
    } else {
      writeRaw(db, KEYS.geminiApiKey, encodeSecret(trimmed));
    }
  }
  if (input.ollamaBaseUrl !== undefined) {
    writeRaw(db, KEYS.ollamaBaseUrl, input.ollamaBaseUrl.trim() || OLLAMA_DEFAULTS.baseUrl);
  }
  if (input.ollamaTextModel !== undefined) {
    writeRaw(db, KEYS.ollamaTextModel, input.ollamaTextModel.trim() || OLLAMA_DEFAULTS.textModel);
  }
  if (input.ollamaVisionModel !== undefined) {
    writeRaw(db, KEYS.ollamaVisionModel, input.ollamaVisionModel.trim() || OLLAMA_DEFAULTS.visionModel);
  }
  if (input.ffmpegPath !== undefined) {
    writeRaw(db, KEYS.ffmpegPath, input.ffmpegPath.trim());
  }
  return getSettings(db);
}

/** Main-process only: returns the decrypted Gemini API key for outbound API calls. */
export function getGeminiApiKey(db: Database.Database): string | null {
  return decodeSecret(readRaw(db, KEYS.geminiApiKey));
}
