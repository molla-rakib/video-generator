import { getProviderCredentials, getProviderSettingView, recordProviderTest } from "@studio/database";
import { ClaudeBrain, DEFAULT_CLAUDE_MODEL } from "./anthropic";
import { ClaudeCliBrain } from "./claude-cli";
import { DEFAULT_GPT_MODEL, DEFAULT_IMAGE_MODEL, GptBrain, OpenAIImages, OpenAIWhisper } from "./openai";
import { ElevenLabsSounds } from "./elevenlabs-sounds";
import { ElevenLabs, VoiceStudio } from "./speech";
import { ProviderNotConfiguredError, type ImageGenerator, type SpeechEngine, type TextBrain, type Transcriber } from "./types";
import { LocalWhisper } from "./whisper-local";

/**
 * Provider ids as stored in the `providersettings` collection.
 * "studio" holds the user's choices of which engine to use for each job.
 */
export const PROVIDERS = ["anthropic", "openai", "elevenlabs", "voicestudio", "whisper"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export const ENV_KEYS: Partial<Record<ProviderId, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
  voicestudio: "VOICESTUDIO_API_KEY",
};

export interface StudioChoices {
  brain: "anthropic" | "openai" | null;
  voice: "voicestudio" | "elevenlabs";
  transcriber: "whisper-local" | "openai-whisper";
}

export async function getStudioChoices(): Promise<StudioChoices> {
  const { options } = await getProviderCredentials("studio");
  return {
    brain: options.brain === "anthropic" || options.brain === "openai" ? options.brain : null,
    voice: options.voice === "elevenlabs" ? "elevenlabs" : "voicestudio",
    transcriber: options.transcriber === "openai-whisper" ? "openai-whisper" : "whisper-local",
  };
}

const str = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim() : fallback);

/**
 * How Claude is reached: through the Claude Code app on this computer (its own
 * sign-in, no key needed) or with an Anthropic API key. Until the user picks,
 * a saved/env key means "apiKey", otherwise the local app.
 */
export type ClaudeConnection = "cli" | "apiKey";
export function claudeConnection(options: Record<string, unknown>, hasKey: boolean): ClaudeConnection {
  if (options.connection === "cli" || options.connection === "apiKey") return options.connection;
  return hasKey ? "apiKey" : "cli";
}

function claudeBrain(c: { apiKey: string | null; options: Record<string, unknown> }): TextBrain | null {
  const model = str(c.options.model, DEFAULT_CLAUDE_MODEL);
  if (claudeConnection(c.options, Boolean(c.apiKey)) === "cli") return new ClaudeCliBrain(str(c.options.command, "claude"), model);
  return c.apiKey ? new ClaudeBrain(c.apiKey, model) : null;
}

async function creds(id: ProviderId) {
  return getProviderCredentials(id, ENV_KEYS[id]);
}

/** ElevenLabs for sound effects and music, or null when it isn't connected. */
export async function getSoundGenerator(): Promise<ElevenLabsSounds | null> {
  const c = await creds("elevenlabs");
  return c.apiKey ? new ElevenLabsSounds(c.apiKey) : null;
}

/** How to launch Claude Code as the studio's agent, from the user's Settings. */
export async function getClaudeAgentConfig(): Promise<{ command: string; model: string; apiKey: string | null }> {
  const c = await creds("anthropic");
  const viaKey = claudeConnection(c.options, Boolean(c.apiKey)) === "apiKey";
  if (viaKey && !c.apiKey) throw new ProviderNotConfiguredError("Claude", "Enter an Anthropic API key in Settings, or switch Claude to the app on this computer.");
  return { command: str(c.options.command, "claude"), model: str(c.options.model, DEFAULT_CLAUDE_MODEL), apiKey: viaKey ? c.apiKey : null };
}

/** The AI brain (Claude or GPT) for story, planning and the assistant. */
export async function getBrain(): Promise<TextBrain> {
  const choices = await getStudioChoices();
  const [anthropic, openai] = await Promise.all([creds("anthropic"), creds("openai")]);
  const order: Array<"anthropic" | "openai"> = choices.brain ? [choices.brain] : ["anthropic", "openai"];
  for (const id of order) {
    const claude = id === "anthropic" ? claudeBrain(anthropic) : null;
    if (claude) return claude;
    if (id === "openai" && openai.apiKey) return new GptBrain(openai.apiKey, str(openai.options.model, DEFAULT_GPT_MODEL));
  }
  throw new ProviderNotConfiguredError(
    choices.brain === "openai" ? "GPT" : choices.brain === "anthropic" ? "Claude" : "An AI brain (Claude or GPT)",
    choices.brain === "anthropic" ? "Enter an Anthropic API key in Settings, or switch Claude to the app on this computer." : "Connect Claude or OpenAI in Settings.",
  );
}

export async function getSpeechEngine(): Promise<SpeechEngine> {
  const choices = await getStudioChoices();
  if (choices.voice === "elevenlabs") {
    const el = await creds("elevenlabs");
    if (!el.apiKey) throw new ProviderNotConfiguredError("ElevenLabs", "Add your ElevenLabs API key in Settings, or switch the voice engine to VoiceStudio.");
    return new ElevenLabs(el.apiKey, typeof el.options.voiceId === "string" ? el.options.voiceId : null, str(el.options.model, "eleven_v4"));
  }
  const vs = await creds("voicestudio");
  return new VoiceStudio(str(vs.options.baseUrl, "http://127.0.0.1:3900"), str(vs.options.voice, "default"), vs.apiKey);
}

export async function getTranscriber(): Promise<Transcriber> {
  const choices = await getStudioChoices();
  if (choices.transcriber === "openai-whisper") {
    const oa = await creds("openai");
    if (!oa.apiKey) throw new ProviderNotConfiguredError("OpenAI transcription", "Add an OpenAI API key in Settings, or switch to local Whisper.");
    return new OpenAIWhisper(oa.apiKey);
  }
  const w = await creds("whisper");
  return new LocalWhisper(str(w.options.command, "whisper"), str(w.options.model, "medium"));
}

export async function getImageGenerator(): Promise<ImageGenerator> {
  const oa = await creds("openai");
  if (!oa.apiKey) {
    throw new ProviderNotConfiguredError(
      "Picture generation",
      "Claude can plan visuals but can't draw them. Add an OpenAI API key in Settings to generate images, or upload your own pictures.",
    );
  }
  return new OpenAIImages(oa.apiKey, str(oa.options.imageModel, DEFAULT_IMAGE_MODEL));
}

/** Run a provider's connection test and remember the result. */
export async function testProvider(id: ProviderId): Promise<{ ok: boolean; message: string }> {
  try {
    const c = await creds(id);
    let message: string;
    switch (id) {
      case "anthropic": {
        const brain = claudeBrain(c);
        if (!brain) throw new ProviderNotConfiguredError("Claude", "Enter an API key first, or switch to the Claude app on this computer.");
        message = await brain.test();
        break;
      }
      case "openai":
        if (!c.apiKey) throw new ProviderNotConfiguredError("OpenAI", "Enter an API key first.");
        message = await new GptBrain(c.apiKey, str(c.options.model, DEFAULT_GPT_MODEL)).test();
        break;
      case "elevenlabs":
        if (!c.apiKey) throw new ProviderNotConfiguredError("ElevenLabs", "Enter an API key first.");
        message = await new ElevenLabsSounds(c.apiKey).test();
        break;
      case "voicestudio":
        message = await new VoiceStudio(str(c.options.baseUrl, "http://127.0.0.1:3900"), "default", c.apiKey).test();
        break;
      case "whisper":
        message = await new LocalWhisper(str(c.options.command, "whisper"), str(c.options.model, "medium")).test();
        break;
    }
    await recordProviderTest(id, true, message);
    return { ok: true, message };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The test failed.";
    await recordProviderTest(id, false, message);
    return { ok: false, message };
  }
}

export interface AgentStatus {
  id: "story" | "voice" | "transcription" | "visual" | "images" | "render";
  name: string;
  description: string;
  engine: string;
  ready: boolean;
  note: string;
}

/** What each agent will use right now — for the AI Agents page. */
export async function agentStatuses(): Promise<AgentStatus[]> {
  const [choices, anthropic, openai, el, vs, whisper] = await Promise.all([
    getStudioChoices(),
    getProviderSettingView("anthropic"),
    getProviderSettingView("openai"),
    getProviderSettingView("elevenlabs"),
    getProviderSettingView("voicestudio"),
    getProviderSettingView("whisper"),
  ]);
  const anthropicKey = anthropic.hasKey || Boolean(process.env.ANTHROPIC_API_KEY);
  const claudeViaCli = claudeConnection(anthropic.options, anthropicKey) === "cli";
  // The local app needs no key; treat it as ready unless its last test failed.
  const claudeReady = claudeViaCli ? anthropic.lastTest?.ok !== false : anthropicKey;
  const openaiKey = openai.hasKey || Boolean(process.env.OPENAI_API_KEY);
  const brainId = choices.brain ?? (claudeReady ? "anthropic" : openaiKey ? "openai" : null);
  const brainReady = brainId === "anthropic" ? claudeReady : brainId === "openai" ? openaiKey : false;
  const brainName = brainId === "anthropic" ? (claudeViaCli ? "Claude (app on this computer)" : "Claude") : brainId === "openai" ? "GPT" : "Not connected";
  const brainNote = brainReady
    ? brainId === "anthropic" && claudeViaCli && !anthropic.lastTest
      ? "Uses the Claude app on this computer — press Test connection in Settings to check it's signed in."
      : ""
    : brainId === "anthropic" && claudeViaCli
      ? "The Claude app on this computer didn't respond last time — check it's installed and signed in, then test again."
      : "Connect Claude or OpenAI in Settings.";
  const voiceReady = choices.voice === "elevenlabs" ? el.hasKey || Boolean(process.env.ELEVENLABS_API_KEY) : vs.lastTest?.ok !== false;
  return [
    { id: "story", name: "Story Agent", description: "Researches the topic and writes the Bangla script, scene by scene.", engine: brainName, ready: brainReady, note: brainNote },
    {
      id: "voice",
      name: "Voice Agent",
      description: "Turns each scene's narration into Bangla voice-over.",
      engine: choices.voice === "elevenlabs" ? "ElevenLabs" : "VoiceStudio (on this computer)",
      ready: voiceReady,
      note: voiceReady ? (choices.voice === "voicestudio" && !vs.lastTest ? "Make sure the VoiceStudio app is running, then press Test." : "") : choices.voice === "elevenlabs" ? "Add an ElevenLabs key in Settings." : "VoiceStudio didn't respond last time — start it and test again.",
    },
    {
      id: "transcription",
      name: "Transcription Agent",
      description: "Listens to the narration and creates timed Bangla subtitles.",
      engine: choices.transcriber === "openai-whisper" ? "OpenAI Whisper (cloud)" : "Whisper (on this computer)",
      ready: choices.transcriber === "openai-whisper" ? openaiKey : whisper.lastTest?.ok !== false,
      note:
        choices.transcriber === "openai-whisper"
          ? openaiKey ? "OpenAI plans to retire whisper-1 on 2027-02-26." : "Add an OpenAI key in Settings."
          : whisper.lastTest?.ok === false ? "Whisper isn't installed — pip install -U openai-whisper" : "",
    },
    { id: "visual", name: "Visual Planning Agent", description: "Plans shots for each scene to match the narration timing.", engine: brainName, ready: brainReady, note: brainNote },
    {
      id: "images",
      name: "Image Generator",
      description: "Creates pictures for planned shots. You can always upload your own instead.",
      engine: openaiKey ? "OpenAI Images" : "Not connected",
      ready: openaiKey,
      note: openaiKey ? "" : "Needs an OpenAI key. Claude can plan visuals but can't draw them.",
    },
    { id: "render", name: "Rendering Engine", description: "Composes everything with Remotion and exports the final video.", engine: "Remotion + FFmpeg (on this computer)", ready: true, note: "" },
  ];
}
