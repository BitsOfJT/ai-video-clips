import { OLLAMA_DEFAULTS } from "../../../src/constants";
import type { AnalysisContext, AnalysisProvider, ChunkInput, ScoredChunk, VisionChunkInput } from "./types";
import { buildChunksText, buildSystemPrompt, parseScoredResponse } from "./prompt";

interface OllamaMessage {
  role: "system" | "user";
  content: string;
  images?: string[]; // base64 JPEG, no data: prefix
}

interface OllamaResponse {
  message?: { content?: string };
  error?: string;
}

/**
 * Ollama provider — fully local and offline, no API key required. Uses a text
 * model for the batched pass and a vision model for keyframe refinement. JSON
 * output is requested via `format: "json"`.
 */
export class OllamaProvider implements AnalysisProvider {
  readonly name = "ollama";

  constructor(
    private readonly baseUrl: string = OLLAMA_DEFAULTS.baseUrl,
    private readonly textModel: string = OLLAMA_DEFAULTS.textModel,
    private readonly visionModel: string = OLLAMA_DEFAULTS.visionModel
  ) {}

  async scoreChunksText(chunks: ChunkInput[], ctx: AnalysisContext): Promise<ScoredChunk[]> {
    const messages: OllamaMessage[] = [
      { role: "system", content: buildSystemPrompt(ctx) },
      { role: "user", content: buildChunksText(chunks) },
    ];
    return this.chat(this.textModel, messages);
  }

  async scoreChunksVision(chunks: VisionChunkInput[], ctx: AnalysisContext): Promise<ScoredChunk[]> {
    // Local vision models handle one image set per message best; send one
    // user message per chunk, each carrying that chunk's keyframes.
    const messages: OllamaMessage[] = [{ role: "system", content: buildSystemPrompt(ctx) }];
    for (const chunk of chunks) {
      messages.push({
        role: "user",
        content: `--- SEGMENT index=${chunk.index} (${chunk.startSec.toFixed(1)}s-${chunk.endSec.toFixed(
          1
        )}s) ---\n${chunk.text}\nThe attached keyframes are from this segment. Score it.`,
        images: chunk.keyframes,
      });
    }
    return this.chat(this.visionModel, messages);
  }

  private async chat(model: string, messages: OllamaMessage[]): Promise<ScoredChunk[]> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/api/chat`;
    const body = {
      model,
      messages,
      stream: false,
      format: "json",
      options: { temperature: 0.4 },
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(
        `Could not reach Ollama at ${this.baseUrl}. Is it running? (${(err as Error).message})`,
        { cause: err }
      );
    }

    const json = (await response.json().catch(() => ({}))) as OllamaResponse;
    if (!response.ok) {
      const detail = json.error ?? `HTTP ${response.status}`;
      const hint = /not found|no such model/i.test(detail)
        ? ` — pull it first with: ollama pull ${model}`
        : "";
      throw new Error(`Ollama request failed: ${detail}${hint}`);
    }

    const content = json.message?.content ?? "";
    if (!content) {
      throw new Error("Ollama returned an empty response.");
    }
    return parseScoredResponse(content);
  }
}
