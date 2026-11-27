import type { NextRequest } from "next/server";
import { z } from "zod";
import { getProject, getTimeline, saveTimeline, snapshotTimeline, timelineFingerprint, touchProject } from "@studio/database";
import { apiHandler, readJson } from "@/lib/server/api";

type Context = RouteContext<"/api/projects/[projectId]/timeline">;

/** The project's project.json. */
export const GET = apiHandler(async (request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  if (request.nextUrl.searchParams.get("fingerprintOnly")) {
    return Response.json({ fingerprint: await timelineFingerprint(projectId) });
  }
  return Response.json(await getTimeline(projectId));
});

const SaveBody = z.object({
  timeline: z.unknown(),
  /** The version the editor changed; the save is refused if the file changed since. */
  baseFingerprint: z.string().min(1),
  /** Keep a restorable copy before this save. */
  snapshot: z.string().max(80).optional(),
});

export const PUT = apiHandler(async (request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  const body = SaveBody.parse(await readJson(request));
  if (body.snapshot) await snapshotTimeline(projectId, body.snapshot);
  const saved = await saveTimeline(projectId, body.timeline, body.baseFingerprint, "user");
  // Keep the project card's shape in step with the editor.
  const project = await getProject(projectId);
  if (project.aspectRatio !== saved.timeline.ratio) await touchProject(projectId, "Edited", { aspectRatio: saved.timeline.ratio });
  return Response.json(saved);
});
