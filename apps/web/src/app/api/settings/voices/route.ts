import type { NextRequest } from "next/server";
import { getProviderCredentials } from "@studio/database";
import { ElevenLabs, ENV_KEYS, VoiceStudio } from "@studio/providers";
import { UserFacingError } from "@studio/shared";
import { apiHandler } from "@/lib/server/api";

/** Voices available from a speech engine, for the voice picker. */
export const GET = apiHandler(async (request: NextRequest) => {
  const engine = request.nextUrl.searchParams.get("engine");
  if (engine === "elevenlabs") {
    const c = await getProviderCredentials("elevenlabs", ENV_KEYS.elevenlabs);
    if (!c.apiKey) throw new UserFacingError("Add your ElevenLabs API key first.");
    return Response.json({ voices: await new ElevenLabs(c.apiKey, null).listVoices() });
  }
  const c = await getProviderCredentials("voicestudio", ENV_KEYS.voicestudio);
  const baseUrl = typeof c.options.baseUrl === "string" && c.options.baseUrl ? c.options.baseUrl : "http://127.0.0.1:3900";
  return Response.json({ voices: await new VoiceStudio(baseUrl, "default", c.apiKey).listVoices() });
});
