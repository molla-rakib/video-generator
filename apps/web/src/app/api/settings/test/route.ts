import { z } from "zod";
import { PROVIDERS, testProvider } from "@studio/providers";
import { apiHandler, readJson } from "@/lib/server/api";

/** Run a real connection test against a provider. */
export const POST = apiHandler(async (request: Request) => {
  const { provider } = z.object({ provider: z.enum(PROVIDERS) }).parse(await readJson(request));
  return Response.json(await testProvider(provider));
});
