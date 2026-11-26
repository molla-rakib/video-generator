import { z } from "zod";
import { getProviderSettingView, saveProviderSetting } from "@studio/database";
import { ENV_KEYS, getStudioChoices, PROVIDERS, type ProviderId } from "@studio/providers";
import { apiHandler, readJson } from "@/lib/server/api";

/** Provider settings for the Settings page. Secrets are never included. */
export const GET = apiHandler(async () => {
  const views = await Promise.all(PROVIDERS.map((p) => getProviderSettingView(p)));
  return Response.json({
    choices: await getStudioChoices(),
    providers: Object.fromEntries(
      views.map((v) => [v.provider, { ...v, fromEnvironment: Boolean(ENV_KEYS[v.provider as ProviderId] && process.env[ENV_KEYS[v.provider as ProviderId]!]) }]),
    ),
  });
});

const OptionValue = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);

const Body = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("choices"),
    brain: z.enum(["anthropic", "openai"]).nullable().optional(),
    voice: z.enum(["voicestudio", "elevenlabs"]).optional(),
    transcriber: z.enum(["whisper-local", "openai-whisper"]).optional(),
  }),
  z.object({
    target: z.enum(PROVIDERS),
    /** undefined = keep, "" or null = remove */
    apiKey: z.string().max(500).nullable().optional(),
    options: z.record(z.string().regex(/^[a-zA-Z]+$/), OptionValue).optional(),
  }),
]);

export const PUT = apiHandler(async (request: Request) => {
  const body = Body.parse(await readJson(request));
  if (body.target === "choices") {
    const { target: _t, ...options } = body;
    void _t;
    await saveProviderSetting("studio", { options });
    return Response.json({ choices: await getStudioChoices() });
  }
  const view = await saveProviderSetting(body.target, {
    apiKey: body.apiKey === undefined ? undefined : body.apiKey?.trim() || null,
    options: body.options,
  });
  return Response.json({ provider: view });
});
