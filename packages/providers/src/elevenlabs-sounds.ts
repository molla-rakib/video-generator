import { describeHttpError, ProviderError } from "./types";

/**
 * ElevenLabs as the studio uses it: ONLY for sound effects and background
 * music. The voiceover is always the user's own file and is never sent here.
 * When no key is connected, the agent creates sounds itself instead.
 */
export class ElevenLabsSounds {
  constructor(private readonly apiKey: string) {}

  /**
   * Check the key. Keys can be restricted to just "Sound Effects" and
   * "Music"; such a key may not read account details, which still proves it
   * is valid — so a "missing permissions" answer counts as connected.
   */
  async test(): Promise<string> {
    let response: Response;
    try {
      response = await fetch("https://api.elevenlabs.io/v1/user", {
        headers: { "xi-api-key": this.apiKey },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new ProviderError("Couldn't reach ElevenLabs. Check the internet connection.", String(error), true);
    }
    if (response.ok) {
      const body = (await response.json().catch(() => ({}))) as { subscription?: { tier?: string } };
      const tier = body.subscription?.tier;
      return `Connected to ElevenLabs${tier ? ` (${tier} plan)` : ""}. Sound effects and music will be generated there.`;
    }
    const text = await response.text();
    if (response.status === 401 && /missing_permissions/i.test(text)) {
      return "Key accepted. Sound effects and music will be generated with ElevenLabs.";
    }
    throw describeHttpError("ElevenLabs", response.status, text);
  }

  private async post(path: string, body: Record<string, unknown>, timeoutMs: number): Promise<Buffer> {
    let response: Response;
    try {
      response = await fetch(`https://api.elevenlabs.io${path}`, {
        method: "POST",
        headers: { "xi-api-key": this.apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new ProviderError("Couldn't reach ElevenLabs. Check the internet connection.", String(error), true);
    }
    if (!response.ok) throw describeHttpError("ElevenLabs", response.status, await response.text());
    return Buffer.from(await response.arrayBuffer());
  }

  /** A sound effect from a text prompt (0.5–22 s), as MP3. */
  async soundEffect(prompt: string, durationSeconds?: number): Promise<Buffer> {
    const duration = durationSeconds ? Math.min(22, Math.max(0.5, durationSeconds)) : undefined;
    return this.post("/v1/sound-generation", { text: prompt, ...(duration ? { duration_seconds: duration } : {}), prompt_influence: 0.45 }, 2 * 60_000);
  }

  /** Background music from a prompt, as MP3. */
  async music(prompt: string, lengthSeconds: number): Promise<Buffer> {
    const ms = Math.round(Math.min(300, Math.max(10, lengthSeconds)) * 1000);
    return this.post("/v1/music", { prompt, music_length_ms: ms }, 6 * 60_000);
  }
}
