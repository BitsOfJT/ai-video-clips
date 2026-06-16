import { GEMINI_DEFAULT_MODEL } from "../../../src/constants";
import type { AnalysisContext, AnalysisProvider, ChunkInput, ScoredChunk, VisionChunkInput } from "./types";
import { buildChunksText, buildSystemPrompt, parseScoredResponse, RESPONSE_SCHEMA } from "./prompt";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
}

/**
 * Google Gemini provider (free tier). Uses structured output
 * (responseMimeType + responseSchema) so the response is guaranteed valid JSON.
 * Network calls run in the Electron main process, so the renderer CSP does not
 * apply.
 */
export class GeminiProvider implements AnalysisProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = GEMINI_DEFAULT_MODEL
  ) {}

  async scoreChunksText(chunks: ChunkInput[], ctx: AnalysisContext): Promise<ScoredChunk[]> {
    const parts: GeminiPart[] = [{ text: buildChunksText(chunks) }];
    return this.generate(parts, ctx);
  }

  async scoreChunksVision(chunks: VisionChunkInput[], ctx: AnalysisContext): Promise<ScoredChunk[]> {
    const parts: GeminiPart[] = [];
    for (const chunk of chunks) {
      parts.push({
        text: `--- SEGMENT index=${chunk.index} (${chunk.startSec.toFixed(1)}s-${chunk.endSec.toFixed(
          1
        )}s) ---\n${chunk.text}\nKeyframes for this segment:`,
      });
      for (const frame of chunk.keyframes) {
        parts.push({ inlineData: { mimeType: "image/jpeg", data: frame } });
      }
    }
    return this.generate(parts, ctx);
  }

  private async generate(parts: GeminiPart[], ctx: AnalysisContext): Promise<ScoredChunk[]> {
    const url = `${ENDPOINT}/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const body = {
      systemInstruction: { parts: [{ text: buildSystemPrompt(ctx) }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.4,
      },
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(`Could not reach Gemini. Check your internet connection. (${(err as Error).message})`, {
        cause: err,
      });
    }

    const json = (await response.json().catch(() => ({}))) as GeminiResponse;
    if (!response.ok) {
      const detail = json.error?.message ?? `HTTP ${response.status}`;
      // 429 is the common free-tier rate-limit signal.
      const hint = response.status === 429 ? " (free-tier rate limit hit — wait a minute or switch to Ollama)" : "";
      throw new Error(`Gemini request failed: ${detail}${hint}`);
    }

    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text) {
      throw new Error("Gemini returned an empty response.");
    }
    return parseScoredResponse(text);
  }
}
