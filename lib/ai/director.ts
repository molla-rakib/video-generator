/**
 * The AI director: turns a prompt (or a change request) into a DocSpec.
 *
 * Claude receives a director brief + the catalog of everything the Remotion
 * engine can draw, optionally researches facts with web search, and returns
 * the whole video through the `create_video` tool. The result is validated
 * with Zod; validation errors go back to Claude to fix (max 2 repair rounds).
 *
 * Server-only (uses the API key).
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { BACKGROUNDS, CAMERA_MOVES, CHARACTER_ACTIONS, EFFECTS, EXPRESSIONS, HAIR_STYLES, HATS, OUTFITS, PROPS, PROP_ACTIONS } from "../spec/animation";
import { ART_STYLES, DocSpecSchema, RATIOS, type DocSpec } from "../spec/schema";
import { firstFlight } from "../samples/firstFlight";

const MODEL = "claude-opus-5-5";
const MAX_REPAIRS = 2;
const MAX_TURNS = 8;

export const GenerateRequestSchema = z.object({
  mode: z.enum(["create", "edit"]).default("create"),
  prompt: z.string().min(3).max(4000),
  art: z.enum(ART_STYLES).default("flat"),
  ratio: z.enum(RATIOS).default("16:9"),
  lengthSec: z.number().int().min(20).max(300).default(60),
  research: z.boolean().default(true),
  /** Current video, for edits. */
  spec: z.unknown().optional(),
});
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

export type DirectorEvent =
  | { type: "status"; stage: "research" | "writing" | "fixing" | "done"; message: string }
  | { type: "search"; query: string }
  | { type: "sources"; items: { title: string; url: string }[] }
  | { type: "progress"; title?: string; scenes: number }
  | { type: "done"; spec: DocSpec }
  | { type: "error"; code: "missing_key" | "auth" | "rate_limit" | "refused" | "invalid" | "failed"; message: string };

// ─── Prompt ─────────────────────────────────────────────────────────────────

const list = (xs: readonly string[]) => xs.map((x) => `\`${x}\``).join(", ");

const SYSTEM = `You are the director of StoryMotion, a studio that turns a user's story or topic into a short 2D animated documentary (cartoon style). You don't draw: you write a precise animation plan that a Remotion engine renders. Everything you place must come from the catalog below.

## Your job
1. Understand the request. Pick an angle that makes a good short film: a hook, rising action, a payoff.
2. If web search is available and the story involves real events, people, places, science or numbers, research first (2-6 focused searches). Only state facts you found or that are uncontroversial common knowledge.
3. Call \`create_video\` exactly once with the complete video. Never write the JSON as text.

## Truthfulness (this is a documentary)
- Every factual narration line gets \`claims\` with \`sourceIds\` pointing at entries in \`sources\`. Only cite URLs that appeared in your search results — never invent or guess a URL. Without research, leave \`sources\` and \`claims\` empty and keep narration to well-established facts.
- Disputed facts: say so in narration ("historians disagree…") and mark the claim \`disputed\`.
- Speech bubbles for real people: only documented quotes, or short generic reactions ("Look!", "It works!"). Never put invented opinions in a real person's mouth.
- Fiction / personal stories: imagination is welcome; no claims or sources needed.

## Structure
- Target the requested length. Each scene's on-screen time ≈ max(durationSec, narration words ÷ 2.5 + 1.3s). A 60-second video ≈ 6-8 scenes.
- 2-4 chapters with short titles; title cards and the opening are added automatically.
- Narration: 10-30 words per scene, vivid and plain, spoken by an unseen narrator.
- Mostly \`animation\` scenes. \`quote\` and \`stat\` visuals exist but prefer counters/text inside animation scenes.

## Animation craft (what makes it feel alive)
- Something moves within the first second of every scene, and every 2-3 seconds after: entrances, walks, gestures, expression changes, props popping in, effects.
- Action times (\`at\`, seconds from scene start) must be < the scene's length. Spread actions over the scene; don't stack everything at 0.
- Characters: 1-3 per scene (max 4), at least 0.18 apart on x, facing each other when they interact. Use \`enter\`/\`exit\`/\`walk-to\` for staging. Make characters talk when they have a speech bubble (bubbles make them talk automatically).
- Speech bubbles: ≤ 12 words, 2-3.5 s, never two at once.
- Vary camera moves across scenes (\`push-in\` on emotional beats, \`follow\` for journeys, \`pan-*\` for landscapes, \`static\` for dialogue).
- Layout (stage coordinates): characters stand on the ground (y=1). Their heads reach about y≈0.5 at scale 1. Put labels at y≈0.1-0.18, titles/years/counters at y≈0.22-0.35, timelines at y≈0.3. Sky props (planes, satellites, planets) at y≈0.25-0.6. Keep important things between x=0.15 and x=0.85 so all aspect ratios work.
- Props: \`scale\` 1 ≈ natural size next to a 1-scale person (rocket ≈ 1.3× person height; planes 0.5-0.8 when flying). Use \`hiddenUntilFirstAction\` + \`pop-in\` to reveal things.
- Time of day and background must fit the story (use \`dunes\` not \`beach\` for non-tropical sand; \`space\` for orbit; \`moon\` for the lunar surface).
- Cast: define each character once in \`cast\` with a look that matches the person/era (outfit, hair, hat, colors) so they're recognizable and consistent. Child = height 0.65-0.75.

## Catalog
- backgrounds: ${list(BACKGROUNDS)}; time: \`day\`, \`sunset\`, \`night\`
- camera: ${list(CAMERA_MOVES)} (\`target\` = element id for follow / push-in)
- character actions: ${list(CHARACTER_ACTIONS)}
- expressions: ${list(EXPRESSIONS)}
- outfits: ${list(OUTFITS)}; hair: ${list(HAIR_STYLES)}; hats: ${list(HATS)}
- props: ${list(PROPS)}
- prop actions: ${list(PROP_ACTIONS)}
- effects: ${list(EFFECTS)}
- other elements: \`speech\` (kind speech|thought|shout), \`text\` (style title|label|year|caption), \`counter\` (animated number), \`timeline\` (2-6 events)
- style.preset: use \`cartoon\`. style.art: as requested.

## Reference example (a finished 85-second video in the correct format)
${JSON.stringify(firstFlight)}`;

function userMessage(req: GenerateRequest): string {
  if (req.mode === "edit") {
    return [
      "Here is the current video:",
      JSON.stringify(req.spec),
      "",
      `Change request: ${req.prompt}`,
      "",
      "Apply the change and call create_video with the COMPLETE updated video. Keep everything the request doesn't touch identical (same ids, cast, sources, scenes). If the change adds new facts, research them first.",
    ].join("\n");
  }
  return [
    "Make an animated documentary video.",
    `Story / topic: ${req.prompt}`,
    `Target length: about ${req.lengthSec} seconds`,
    `Art style (style.art): ${req.art}`,
    `Main format: ${req.ratio}${req.ratio === "9:16" || req.ratio === "4:5" ? " (vertical — keep staging central, fewer characters per scene)" : ""}`,
    `Research: ${req.research ? "on — verify facts with web search and cite sources" : "off — no sources; stick to well-known facts or the user's own story"}`,
    "Write narration in the language the story is written in.",
  ].join("\n");
}

// ─── Tool ───────────────────────────────────────────────────────────────────

function videoInputSchema() {
  const schema = z.toJSONSchema(DocSpecSchema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

function formatIssues(error: z.ZodError): string {
  const lines = error.issues.slice(0, 15).map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`);
  const more = error.issues.length > 15 ? `\n…and ${error.issues.length - 15} more.` : "";
  return `The video failed validation. Fix these problems and call create_video again with the complete video:\n${lines.join("\n")}${more}`;
}

// ─── Run ────────────────────────────────────────────────────────────────────

export async function runDirector(req: GenerateRequest, emit: (e: DirectorEvent) => void, signal?: AbortSignal): Promise<void> {
  // Credentials resolve lazily (env key, auth token or an `ant auth login` profile).
  const client = new Anthropic();

  const tools: Anthropic.Beta.BetaToolUnion[] = [
    ...(req.research ? [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 6 }] : []),
    {
      name: "create_video",
      description: "Submit the complete animated documentary (DocSpec). Call exactly once, with every chapter and scene.",
      input_schema: videoInputSchema() as Anthropic.Beta.BetaTool.InputSchema,
      eager_input_streaming: true,
    },
  ];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: userMessage(req) }];

  emit({ type: "status", stage: req.research ? "research" : "writing", message: req.research ? "Researching the story…" : "Writing the script…" });

  let repairs = 0;
  let lastScenes = -1;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools,
        messages,
      },
      { signal },
    );

    stream.on("contentBlock", (block) => {
      if (block.type === "server_tool_use" && block.name === "web_search") {
        const q = (block.input as { query?: string })?.query;
        if (q) emit({ type: "search", query: q });
      } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        emit({ type: "sources", items: block.content.slice(0, 5).map((r) => ({ title: r.title, url: r.url })) });
      } else if (block.type === "tool_use" && block.name === "create_video") {
        emit({ type: "status", stage: "writing", message: "Checking the animation plan…" });
      }
    });
    stream.on("inputJson", (_partial, snapshot) => {
      const snap = snapshot as { meta?: { title?: string }; chapters?: { scenes?: unknown[] }[] } | undefined;
      const scenes = snap?.chapters?.reduce((n, c) => n + (c.scenes?.length ?? 0), 0) ?? 0;
      if (scenes !== lastScenes) {
        if (lastScenes <= 0) emit({ type: "status", stage: "writing", message: "Directing scenes…" });
        lastScenes = scenes;
        emit({ type: "progress", title: snap?.meta?.title, scenes });
      }
    });

    let msg: Anthropic.Beta.BetaMessage;
    try {
      msg = await stream.finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        emit({ type: "error", code: "auth", message: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local." });
        return;
      }
      if (err instanceof Anthropic.RateLimitError) {
        emit({ type: "error", code: "rate_limit", message: "Claude is busy (rate limited). Please try again in a minute." });
        return;
      }
      if (err instanceof Anthropic.APIError) throw err;
      // The SDK couldn't find any credentials (no env key, no `ant auth login` profile).
      if (err instanceof Anthropic.AnthropicError && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
        emit({ type: "error", code: "missing_key", message: "No Anthropic API key found. Add ANTHROPIC_API_KEY to .env.local and restart the dev server." });
        return;
      }
      // Unparseable streamed tool input or dropped connection: retry the turn once more.
      if (repairs++ < MAX_REPAIRS) continue;
      throw err;
    }

    if (msg.stop_reason === "refusal") {
      emit({ type: "error", code: "refused", message: "Claude declined to make this video. Try rephrasing the story." });
      return;
    }
    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }

    const toolUse = msg.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "create_video");
    if (!toolUse) {
      if (msg.stop_reason === "max_tokens") break;
      messages.push({ role: "assistant", content: msg.content });
      messages.push({ role: "user", content: "Now call create_video with the complete video." });
      continue;
    }
    if (msg.stop_reason === "max_tokens") {
      emit({ type: "error", code: "invalid", message: "The video plan was too long. Try a shorter target length." });
      return;
    }

    const parsed = DocSpecSchema.safeParse(toolUse.input);
    if (parsed.success) {
      emit({ type: "status", stage: "done", message: "Ready!" });
      emit({ type: "done", spec: parsed.data });
      return;
    }
    if (repairs++ >= MAX_REPAIRS) {
      emit({ type: "error", code: "invalid", message: "Claude's animation plan didn't pass validation after several attempts. Please try again." });
      return;
    }
    emit({ type: "status", stage: "fixing", message: `Polishing ${parsed.error.issues.length} detail${parsed.error.issues.length === 1 ? "" : "s"}…` });
    messages.push({ role: "assistant", content: msg.content });
    messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: toolUse.id, is_error: true, content: formatIssues(parsed.error) }] });
  }
  emit({ type: "error", code: "failed", message: "Generation didn't finish. Please try again." });
}
