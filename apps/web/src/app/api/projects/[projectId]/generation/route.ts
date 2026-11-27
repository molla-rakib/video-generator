import type { NextRequest } from "next/server";
import { describeProgress, getProject, loadProgress, projectDirectory } from "@studio/database";
import { apiHandler } from "@/lib/server/api";

type Context = RouteContext<"/api/projects/[projectId]/generation">;

/**
 * How far "Start animating" got (from plan/progress.json): which step it's
 * on and how many parts are built — for the "Continue animating" button.
 */
export const GET = apiHandler(async (_request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  await getProject(projectId);
  return Response.json(describeProgress(await loadProgress(await projectDirectory(projectId))));
});
