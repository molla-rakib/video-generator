import { describeHttpError, ProviderError, type GeneratedAudio, type SpeechEngine } from "./types";

async function fetchOrExplain(service: string, url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(10 * 60_000) });
  } catch (error) {
    throw new ProviderError(
      service === "VoiceStudio"
        ? "Couldn't reach VoiceStudio. Make sure the VoiceStudio app is running on this computer."
        : `Couldn't reach ${service}. Check the internet connection.`,
      String(error),
      true,
    );
  }
  if (!response.ok) throw describeHttpError(service, response.status, await response.text());
  return response;
}

/**
 * VoiceStudio (local app, https://github.com/debpalash/VoiceStudio).
 * Uses its OpenAI-compatible endpoint POST /v1/audio/speech, which accepts a
 * `language` code (Bengali = "bn") and returns audio bytes.
 */
export class VoiceStudio implements SpeechEngine {
  readonly id = "voicestudio" as const;
  readonly label = "VoiceStudio";
  readonly maxChars = 4000;

  constructor(
    private readonly baseUrl: string = "http://127.0.0.1:3900",
    private readonly defaultVoice: string = "default",
    private readonly apiKey: string | null = null,
  ) {}

  private headers(): Record<string, string> {
    return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {};
  }

  async speak(options: { text: string; language: string; voice?: string | null }): Promise<GeneratedAudio> {
    const response = await fetchOrExplain("VoiceStudio", `${this.baseUrl.replace(/\/$/, "")}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.headers() },
      body: JSON.stringify({
        model: "omnivoice",
        input: options.text,
        voice: options.voice || this.defaultVoice,
        language: options.language,
        response_format: "wav",
      }),
    });
    return { audio: Buffer.from(await response.arrayBuffer()), extension: "wav", mimeType: "audio/wav" };
  }

  async listVoices(): Promise<Array<{ id: string; name: string }>> {
    const response = await fetchOrExplain("VoiceStudio", `${this.baseUrl.replace(/\/$/, "")}/v1/audio/voices`, { headers: this.headers() });
    const body = (await response.json()) as { voices?: Array<{ voice_id?: string; id?: string; name?: string }> };
    return (body.voices ?? []).map((v) => ({ id: v.voice_id ?? v.id ?? "", name: v.name ?? v.voice_id ?? "" })).filter((v) => v.id);
  }

  async test(): Promise<string> {
    const voices = await this.listVoices();
    return `Connected — VoiceStudio is running with ${voices.length} voice${voices.length === 1 ? "" : "s"}.`;
  }
}

/**
 * ElevenLabs text-to-speech. Bengali is supported by eleven_v4 / eleven_v3
 * (not by eleven_multilingual_v2 or flash v2.5).
 */
export class ElevenLabs implements SpeechEngine {
  readonly id = "elevenlabs" as const;
  readonly label = "ElevenLabs";
  readonly maxChars = 4500;

  constructor(
    private readonly apiKey: string,
    private readonly voiceId: string | null,
    private readonly model: string = "eleven_v4",
  ) {}

  async speak(options: { text: string; language: string; voice?: string | null }): Promise<GeneratedAudio> {
    const voice = options.voice || this.voiceId;
    if (!voice) throw new ProviderError("Choose an ElevenLabs voice in Settings first.");
    const response = await fetchOrExplain(
      "ElevenLabs",
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ text: options.text, model_id: this.model, language_code: options.language }),
      },
    );
    return { audio: Buffer.from(await response.arrayBuffer()), extension: "mp3", mimeType: "audio/mpeg" };
  }

  async listVoices(): Promise<Array<{ id: string; name: string }>> {
    const response = await fetchOrExplain("ElevenLabs", "https://api.elevenlabs.io/v2/voices?page_size=100", {
      headers: { "xi-api-key": this.apiKey },
    });
    const body = (await response.json()) as { voices?: Array<{ voice_id: string; name: string }> };
    return (body.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name }));
  }

  async test(): Promise<string> {
    await fetchOrExplain("ElevenLabs", "https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": this.apiKey } });
    return "Connected to ElevenLabs.";
  }
}

/**
 * Split long narration into chunks a speech engine accepts, breaking at
 * sentence ends (Bangla dari "।", ".", "?", "!") and never mid-word.
 */
export function splitForSpeech(text: string, maxChars: number): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean ? [clean] : [];
  const sentences = clean.match(/[^।.!?]+[।.!?]+["”’)]?\s*|[^।.!?]+$/g) ?? [clean];
  const chunks: string[] = [];
  let current = "";
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if ((current + " " + sentence).trim().length <= maxChars) {
      current = (current + " " + sentence).trim();
      continue;
    }
    if (current) chunks.push(current);
    if (sentence.length <= maxChars) {
      current = sentence;
      continue;
    }
    // A single very long sentence: break at spaces.
    current = "";
    for (const word of sentence.split(" ")) {
      if ((current + " " + word).trim().length > maxChars && current) {
        chunks.push(current);
        current = word;
      } else current = (current + " " + word).trim();
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
