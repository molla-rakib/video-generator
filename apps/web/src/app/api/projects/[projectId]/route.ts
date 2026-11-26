import type { NextRequest } from "next/server";
import { deleteProject, getProject, updateProject } from "@studio/database";
import { getStorage } from "@studio/media";
import { apiHandler, readJson } from "@/lib/server/api";

type Context = RouteContext<"/api/projects/[projectId]">;

export const GET = apiHandler(async (_request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  return Response.json({ project: await getProject(projectId) });
});

export const PATCH = apiHandler(async (request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  const project = await updateProject(projectId, (await readJson(request)) as Parameters<typeof updateProject>[1]);
  return Response.json({ project });
});

export const DELETE = apiHandler(async (_request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  const { storagePrefix } = await deleteProject(projectId);
  try {
    await getStorage().deletePrefix(storagePrefix);
  } catch (error) {
    console.error(`[projects] could not remove files for ${projectId}`, error);
  }
  return new Response(null, { status: 204 });
});
