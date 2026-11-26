import { readFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import {
  describeHttpError,
  ProviderError,
  toJsonSchema,
  type AgentAction,
  type AgentTool,
  type GeneratedImage,
  type ImageGenerator,
  type TextBrain,
  type Transcriber,
  type Transcript,
} from "./types";

/**
 * OpenAI adapters (raw HTTPS, per the official API reference):
 * - Responses API for text + tool calling + structured output
 * - Images API for picture generation
 * - whisper-1 transcription (the only model with word/segment timestamps)
 */

const BASE = "https://api.openai.com/v1";
export const DEFAULT_GPT_MODEL = "gpt-6.2-astra";
export const DEFAULT_IMAGE_MODEL = "gpt-image-2.5-flare";

async function call(apiKey: string, pathname: string, init: RequestInit & { json?: unknown }): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${pathname}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      signal: init.signal ?? AbortSignal.timeout(10 * 60_000),
    });
  } catch (error) {
    throw new ProviderError("Couldn't reach OpenAI. Check the internet connection.", String(error), true);
  }
  if (!response.ok) throw describeHttpError("OpenAI", response.status, await response.text());
  return response;
}

interface ResponseItem {
  type: string;
  [key: string]: unknown;
}

interface ResponsesResult {
  status?: string;
  output: ResponseItem[];
  output_text?: string;
  incomplete_details?: { reason?: string } | null;
}

function outputText(result: ResponsesResult): string {
  if (typeof result.output_text === "string" && result.output_text) return result.output_text.trim();
  const parts: string[] = [];
  for (const item of result.output) {
    if (item.type !== "message") continue;
    for (const c of (item.content as Array<{ type: string; text?: string; refusal?: string }>) ?? []) {
      if (c.type === "output_text" && c.text) parts.push(c.text);
      if (c.type === "refusal") throw new ProviderError("GPT declined this request. Try rephrasing it.", c.refusal ?? "");
    }
  }
  return parts.join("").trim();
}

export class GptBrain implements TextBrain {
  readonly id = "openai" as const;
  readonly label = "GPT";

  constructor(
    private readonly apiKey: string,
    readonly model: string = DEFAULT_GPT_MODEL,
  ) {}

  private async respond(body: Record<string, unknown>): Promise<ResponsesResult> {
    const response = await call(this.apiKey, "/responses", { method: "POST", json: { model: this.model, ...body } });
    const result = (await response.json()) as ResponsesResult;
    if (result.status === "incomplete") {
      throw new ProviderError("GPT's answer was cut off. Try asking for a shorter result.", JSON.stringify(result.incomplete_details ?? {}));
    }
    return result;
  }

  async generateJson<T>(options: { system: string; prompt: string; schema: z.ZodType<T>; schemaName: string }): Promise<T> {
    const result = await this.respond({
      instructions: options.system,
      input: [{ role: "user", content: options.prompt }],
      text: { format: { type: "json_schema", name: options.schemaName, schema: toJsonSchema(options.schema), strict: true } },
    });
    const raw = outputText(result);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ProviderError("GPT returned an answer that couldn't be read. Try again.", raw.slice(0, 300), true);
    }
    const checked = options.schema.safeParse(parsed);
    if (!checked.success) throw new ProviderError("GPT's answer was incomplete. Try again.", checked.error.message.slice(0, 500), true);
    return checked.data;
  }

  async runAgent(options: Parameters<TextBrain["runAgent"]>[0]) {
    const tools = options.tools.map((t) => ({
      type: "function",
      name: t.name,
      description: t.description,
      parameters: toJsonSchema(t.input),
      strict: false,
    }));
    const byName = new Map<string, AgentTool<never>>(options.tools.map((t) => [t.name, t]));
    const input: unknown[] = [
      ...options.history.map((m) => ({ role: m.role, content: m.text })),
      { role: "user", content: options.message },
    ];
    const actions: AgentAction[] = [];
    const texts: string[] = [];

    for (let step = 0; step < (options.maxSteps ?? 16); step++) {
      if (await options.shouldStop?.()) break;
      const result = await this.respond({ instructions: options.system, input, tools });
      const text = outputText(result);
      if (text) texts.push(text);
      // Pass every output item back (reasoning items included).
      input.push(...result.output);
      const calls = result.output.filter((i) => i.type === "function_call") as unknown as Array<{ call_id: string; name: string; arguments: string }>;
      if (calls.length === 0) break;
      for (const c of calls) {
        const tool = byName.get(c.name);
        let output: string;
        if (!tool) output = `Unknown tool ${c.name}`;
        else {
          let args: unknown;
          try {
            args = JSON.parse(c.arguments || "{}");
          } catch {
            args = null;
          }
          const parsed = tool.input.safeParse(args);
          if (!parsed.success) output = `Invalid input: ${parsed.error.message}`;
          else {
            try {
              const out = await tool.run(parsed.data as never);
              output = JSON.stringify(out.result ?? { ok: true });
              const action = { tool: c.name, summary: out.summary, ok: true };
              actions.push(action);
              await options.onAction?.(action);
            } catch (error) {
              output = `Failed: ${error instanceof Error ? error.message : String(error)}`;
              const action = { tool: c.name, summary: output, ok: false };
              actions.push(action);
              await options.onAction?.(action);
            }
          }
        }
        input.push({ type: "function_call_output", call_id: c.call_id, output });
      }
    }
    return { text: texts.join("\n\n"), actions };
  }

  async test(): Promise<string> {
    await call(this.apiKey, `/models/${encodeURIComponent(this.model)}`, { method: "GET" });
    return `Connected — ${this.model} is available.`;
  }
}

const IMAGE_SIZES: Record<"16:9" | "9:16" | "1:1", string> = {
  "16:9": "1536x1024",
  "9:16": "1024x1536",
  "1:1": "1024x1024",
};

export class OpenAIImages implements ImageGenerator {
  readonly id = "openai-images" as const;
  readonly label = "OpenAI Images";

  constructor(
    private readonly apiKey: string,
    readonly model: string = DEFAULT_IMAGE_MODEL,
  ) {}

  async generate(options: { prompt: string; aspectRatio: "16:9" | "9:16" | "1:1" }): Promise<GeneratedImage> {
    const response = await call(this.apiKey, "/images/generations", {
      method: "POST",
      json: { model: this.model, prompt: options.prompt, size: IMAGE_SIZES[options.aspectRatio], quality: "medium", n: 1, output_format: "png" },
    });
    const body = (await response.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = body.data?.[0]?.b64_json;
    if (!b64) throw new ProviderError("OpenAI didn't return an image. Try a different description.", JSON.stringify(body).slice(0, 300));
    return { image: Buffer.from(b64, "base64"), extension: "png", mimeType: "image/png" };
  }

  async test(): Promise<string> {
    await call(this.apiKey, `/models/${encodeURIComponent(this.model)}`, { method: "GET" });
    return `Connected — ${this.model} is available.`;
  }
}

/** whisper-1 is deprecated by OpenAI (shutdown 2027-02-26) but is the only hosted option with timestamps. */
export class OpenAIWhisper implements Transcriber {
  readonly id = "openai-whisper" as const;
  readonly label = "OpenAI Whisper (cloud)";

  constructor(private readonly apiKey: string) {}

  async transcribe(options: { filePath: string; language: string }): Promise<Transcript> {
    const data = await readFile(options.filePath);
    if (data.byteLength > 25 * 1024 * 1024) {
      throw new ProviderError("This recording is larger than OpenAI's 25 MB limit. Split it, or use local Whisper.");
    }
    const form = new FormData();
    form.append("file", new Blob([data]), path.basename(options.filePath));
    form.append("model", "whisper-1");
    form.append("language", options.language);
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    form.append("timestamp_granularities[]", "word");
    const response = await call(this.apiKey, "/audio/transcriptions", { method: "POST", body: form });
    const body = (await response.json()) as {
      text?: string;
      language?: string;
      segments?: Array<{ start: number; end: number; text: string }>;
      words?: Array<{ start: number; end: number; word: string }>;
    };
    return {
      text: body.text ?? "",
      language: body.language ?? null,
      segments: (body.segments ?? []).map((s) => ({ start: s.start, end: s.end, text: s.text.trim() })),
      words: body.words ?? [],
    };
  }

  async test(): Promise<string> {
    await call(this.apiKey, "/models/whisper-1", { method: "GET" });
    return "Connected — whisper-1 is available (OpenAI plans to retire it on 2027-02-26).";
  }
}
