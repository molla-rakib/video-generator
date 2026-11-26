import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { ProviderError, toJsonSchema, type AgentAction, type AgentTool, type TextBrain } from "./types";

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

function mapError(error: unknown): never {
  if (error instanceof ProviderError) throw error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    throw new ProviderError("Claude rejected the API key. Check it in Settings.", error.message);
  }
  if (error instanceof Anthropic.RateLimitError) {
    throw new ProviderError("Claude is rate-limiting requests right now. Try again in a minute.", error.message, true);
  }
  if (error instanceof Anthropic.BadRequestError) {
    throw new ProviderError("Claude couldn't accept this request.", error.message);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    throw new ProviderError("Couldn't reach Claude. Check the internet connection.", error.message, true);
  }
  if (error instanceof Anthropic.APIError) {
    throw new ProviderError("Claude had a problem answering. Try again.", error.message, true);
  }
  throw error;
}

function checkStop(message: Anthropic.Beta.BetaMessage): void {
  if (message.stop_reason === "refusal") {
    throw new ProviderError("Claude declined this request. Try rephrasing it.", JSON.stringify(message.stop_details ?? {}));
  }
  if (message.stop_reason === "max_tokens") {
    throw new ProviderError("Claude's answer was too long and got cut off. Try asking for a shorter result.", "max_tokens");
  }
}

function textOf(message: Anthropic.Beta.BetaMessage): string {
  return message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

export class ClaudeBrain implements TextBrain {
  readonly id = "anthropic" as const;
  readonly label = "Claude";
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string = DEFAULT_CLAUDE_MODEL,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  private async send(params: Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, "model" | "max_tokens" | "betas" | "fallbacks" | "stream">) {
    try {
      // Streaming avoids HTTP timeouts on long Bangla scripts.
      const stream = this.client.beta.messages.stream({
        ...params,
        model: this.model,
        max_tokens: 64000,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
      });
      return await stream.finalMessage();
    } catch (error) {
      mapError(error);
    }
  }

  async generateJson<T>(options: { system: string; prompt: string; schema: z.ZodType<T>; schemaName: string; effort?: "low" | "medium" | "high" }): Promise<T> {
    const message = await this.send({
      system: options.system,
      messages: [{ role: "user", content: options.prompt }],
      output_config: { effort: options.effort ?? "high", format: { type: "json_schema", schema: toJsonSchema(options.schema) } },
    });
    checkStop(message);
    const raw = textOf(message);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ProviderError("Claude returned an answer that couldn't be read. Try again.", raw.slice(0, 300), true);
    }
    const result = options.schema.safeParse(parsed);
    if (!result.success) throw new ProviderError("Claude's answer was incomplete. Try again.", result.error.message.slice(0, 500), true);
    return result.data;
  }

  async runAgent(options: Parameters<TextBrain["runAgent"]>[0]) {
    const tools: Anthropic.Beta.BetaTool[] = options.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: toJsonSchema(t.input) as Anthropic.Beta.BetaTool["input_schema"],
    }));
    const byName = new Map<string, AgentTool<never>>(options.tools.map((t) => [t.name, t]));
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...options.history.map((m) => ({ role: m.role, content: m.text }) as Anthropic.Beta.BetaMessageParam),
      { role: "user", content: options.message },
    ];
    const actions: AgentAction[] = [];
    const texts: string[] = [];

    for (let step = 0; step < (options.maxSteps ?? 16); step++) {
      if (await options.shouldStop?.()) break;
      const message = await this.send({ system: options.system, messages, tools, output_config: { effort: "medium" } });
      checkStop(message);
      const text = textOf(message);
      if (text) texts.push(text);
      // Keep the full content (including thinking blocks) unchanged.
      messages.push({ role: "assistant", content: message.content as Anthropic.Beta.BetaContentBlockParam[] });
      if (message.stop_reason === "pause_turn") continue;
      const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (calls.length === 0) break;

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const call of calls) {
        const tool = byName.get(call.name);
        let content: string;
        let isError = false;
        if (!tool) {
          content = `Unknown tool ${call.name}`;
          isError = true;
        } else {
          const parsed = tool.input.safeParse(call.input);
          if (!parsed.success) {
            content = `Invalid input: ${parsed.error.message}`;
            isError = true;
          } else {
            try {
              const out = await tool.run(parsed.data as never);
              content = JSON.stringify(out.result ?? { ok: true });
              const action = { tool: call.name, summary: out.summary, ok: true };
              actions.push(action);
              await options.onAction?.(action);
            } catch (error) {
              content = `Failed: ${error instanceof Error ? error.message : String(error)}`;
              isError = true;
              const action = { tool: call.name, summary: content, ok: false };
              actions.push(action);
              await options.onAction?.(action);
            }
          }
        }
        results.push({ type: "tool_result", tool_use_id: call.id, content, is_error: isError });
      }
      messages.push({ role: "user", content: results });
    }
    return { text: texts.join("\n\n"), actions };
  }

  async test(): Promise<string> {
    try {
      const model = await this.client.models.retrieve(this.model);
      return `Connected — ${model.display_name ?? this.model} is available.`;
    } catch (error) {
      mapError(error);
    }
  }
}
