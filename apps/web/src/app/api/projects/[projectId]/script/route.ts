import type { NextRequest } from "next/server";
import { z } from "zod";
import { getScript, saveScript } from "@studio/database";
import { apiHandler, readJson } from "@/lib/server/api";

type Context = RouteContext<"/api/projects/[projectId]/script">;

export const GET = apiHandler(async (_request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  return Response.json(await getScript(projectId));
});

const SaveBody = z.object({ script: z.unknown(), baseRevision: z.number().int().positive() });

export const PUT = apiHandler(async (request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  const body = SaveBody.parse(await readJson(request));
  return Response.json(await saveScript(projectId, body.script, body.baseRevision));
});
