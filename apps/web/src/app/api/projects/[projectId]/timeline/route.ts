import type { NextRequest } from "next/server";
import { z } from "zod";
import { getTimeline, getTimelineRevision, saveTimeline, snapshotTimeline } from "@studio/database";
import { apiHandler, readJson } from "@/lib/server/api";

type Context = RouteContext<"/api/projects/[projectId]/timeline">;

export const GET = apiHandler(async (request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  if (request.nextUrl.searchParams.get("revisionOnly")) {
    return Response.json({ revision: await getTimelineRevision(projectId) });
  }
  return Response.json(await getTimeline(projectId));
});

const SaveBody = z.object({
  timeline: z.unknown(),
  baseRevision: z.number().int().positive(),
  /** Keep a restorable copy (e.g. when locking audio). */
  snapshot: z.string().max(80).optional(),
});

export const PUT = apiHandler(async (request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  const body = SaveBody.parse(await readJson(request));
  const saved = await saveTimeline(projectId, body.timeline, body.baseRevision, "user");
  if (body.snapshot) await snapshotTimeline(projectId, body.snapshot);
  return Response.json(saved);
});
