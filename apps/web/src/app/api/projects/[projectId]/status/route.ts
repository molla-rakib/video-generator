import type { NextRequest } from "next/server";
import { chatFingerprint, getScriptRevision, getTimelineRevision, listRecentJobs, mediaFingerprint } from "@studio/database";
import { apiHandler } from "@/lib/server/api";

type Context = RouteContext<"/api/projects/[projectId]/status">;

/** Cheap change detection for the editor's polling loop. */
export const GET = apiHandler(async (_request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  const [timelineRevision, scriptRevision, media, chat, jobs] = await Promise.all([
    getTimelineRevision(projectId),
    getScriptRevision(projectId),
    mediaFingerprint(projectId),
    chatFingerprint(projectId),
    listRecentJobs(projectId),
  ]);
  return Response.json({ timelineRevision, scriptRevision, media, chat, jobs });
});
