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
}
