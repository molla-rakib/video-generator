import { z } from "zod";
import { UserFacingError } from "@studio/shared";

/**
 * Provider capability interfaces. Each adapter implements only what its
 * service really supports; the registry picks the one the user connected.
 */

export class ProviderNotConfiguredError extends UserFacingError {
  constructor(what: string, how: string) {
    super(`${what} isn't connected yet. ${how}`, "provider_not_configured", 412);
  }
}

export class ProviderError extends UserFacingError {
  constructor(
    message: string,
    readonly detail: string = "",
    readonly retryable = false,
  ) {
    super(message, "provider_error", 502);
  }
}

// ---------------------------------------------------------------------------
// Text "brains" (Claude, GPT)
// ---------------------------------------------------------------------------

export interface AgentTool<I = unknown> {
  name: string;
  description: string;
  input: z.ZodType<I>;
  /** Runs the action. Throwing is fine — the error is reported to the model. */
  run(input: I): Promise<{ summary: string; result: unknown }>;
}

export interface AgentAction {
  tool: string;
  summary: string;
  ok: boolean;
}

export interface AgentRunResult {
  text: string;
  actions: AgentAction[];
}

export interface TextBrain {
  readonly id: "anthropic" | "openai";
  readonly label: string;
  readonly model: string;
  /** One request whose answer must match a schema. */
  generateJson<T>(options: {
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
    schemaName: string;
    effort?: "low" | "medium" | "high";
  }): Promise<T>;
  /** Conversational tool-using loop (the AI Production Assistant). */
  runAgent(options: {
    system: string;
    history: Array<{ role: "user" | "assistant"; text: string }>;
    message: string;
    tools: AgentTool<never>[];
    maxSteps?: number;
    onAction?: (action: AgentAction) => Promise<void> | void;
    shouldStop?: () => Promise<boolean>;
  }): Promise<AgentRunResult>;
  test(): Promise<string>;
}

// ---------------------------------------------------------------------------
// Media generators
// ---------------------------------------------------------------------------

export interface GeneratedAudio {
  audio: Buffer;
  extension: "mp3" | "wav";
  mimeType: string;
}

export interface SpeechEngine {
  readonly id: "voicestudio" | "elevenlabs";
  readonly label: string;
  /** Longest text accepted in one request; longer text is split by the caller. */
  readonly maxChars: number;
  speak(options: { text: string; language: string; voice?: string | null }): Promise<GeneratedAudio>;
  listVoices(): Promise<Array<{ id: string; name: string }>>;
  test(): Promise<string>;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  text: string;
  language: string | null;
  segments: TranscriptSegment[];
  words: Array<{ start: number; end: number; word: string }>;
}

export interface Transcriber {
  readonly id: "whisper-local" | "openai-whisper";
  readonly label: string;
  transcribe(options: { filePath: string; language: string }): Promise<Transcript>;
  test(): Promise<string>;
}

export interface GeneratedImage {
  image: Buffer;
  extension: "png" | "jpg" | "webp";
  mimeType: string;
}

export interface ImageGenerator {
  readonly id: "openai-images";
  readonly label: string;
  generate(options: { prompt: string; aspectRatio: "16:9" | "9:16" | "1:1" }): Promise<GeneratedImage>;
  test(): Promise<string>;
}

/** JSON Schema for a Zod schema, as accepted by structured-output APIs. */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-7", io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/** Make an error message safe and short for users. */
export function describeHttpError(service: string, status: number, body: string): ProviderError {
  const brief = body.slice(0, 300);
  if (status === 401 || status === 403) return new ProviderError(`${service} rejected the API key. Check it in Settings.`, brief);
  if (status === 429) return new ProviderError(`${service} is rate-limiting requests or the account is out of credit. Try again in a minute.`, brief, true);
  if (status >= 500) return new ProviderError(`${service} is having problems right now. Try again shortly.`, brief, true);
  return new ProviderError(`${service} couldn't complete the request (${status}).`, brief);
}
