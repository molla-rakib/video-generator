import path from "node:path";
import { z } from "zod";
import { databaseUri, getProviderSettingView, saveProviderSetting } from "@studio/database";
import { mediaRoot, repoRoot } from "@studio/media";
import { claudeConnection, ENV_KEYS, getStudioChoices, listBuiltInSkills, PROVIDERS, type ProviderId } from "@studio/providers";
import { apiHandler, readJson } from "@/lib/server/api";

/** Where things live on this computer, for the Settings page. */
function storageInfo() {
  let database = "MongoDB";
  try {
    const url = new URL(databaseUri());
    database = `MongoDB at ${url.host}, database “${url.pathname.replace(/^\//, "") || "default"}”`;
  } catch {
    // keep the generic label
  }
  return {
    projects: path.join(mediaRoot(), "projects"),
    secrets: path.join(repoRoot(), ".data"),
    database,
  };
}

/** Provider settings for the Settings page. Secrets are never included. */
export const GET = apiHandler(async () => {
  const views = await Promise.all(PROVIDERS.map((p) => getProviderSettingView(p)));
  const skills = (await listBuiltInSkills()).map(({ id, name, description }) => ({ id, name, description }));
  return Response.json({
    storage: storageInfo(),
    skills,
    choices: await getStudioChoices(),
    providers: Object.fromEntries(
      views.map((v) => {
        const envKey = ENV_KEYS[v.provider as ProviderId];
        const fromEnvironment = Boolean(envKey && process.env[envKey]);
        // Claude can run through the local Claude app or an API key; send the mode in effect.
        const extra = v.provider === "anthropic" ? { connection: claudeConnection(v.options, v.hasKey || fromEnvironment) } : {};
        return [v.provider, { ...v, fromEnvironment, ...extra }];
      }),
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
    // A different way of connecting makes the previous test result meaningless.
    resetTest: body.options?.connection !== undefined,
  });
  return Response.json({ provider: view });
});
