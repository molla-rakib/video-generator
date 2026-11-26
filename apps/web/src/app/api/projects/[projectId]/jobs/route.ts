import type { NextRequest } from "next/server";
import { z } from "zod";
import { enqueue, getProject, JOB_INPUTS, listRecentJobs, type JobType } from "@studio/database";
import { UserFacingError } from "@studio/shared";
import { apiHandler, readJson } from "@/lib/server/api";

type Context = RouteContext<"/api/projects/[projectId]/jobs">;

export const GET = apiHandler(async (_request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  return Response.json({ jobs: await listRecentJobs(projectId) });
});

/** Jobs the editor may start directly. (The assistant uses the chat endpoint.) */
const STARTABLE: JobType[] = ["story.write", "voice.generate", "subtitles.generate", "storyboard.plan", "images.generate", "render"];

export const POST = apiHandler(async (request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  await getProject(projectId);
  const body = z.object({ type: z.string(), input: z.record(z.string(), z.unknown()).default({}) }).parse(await readJson(request));
  if (!STARTABLE.includes(body.type as JobType) || !(body.type in JOB_INPUTS)) {
    throw new UserFacingError("That action isn't available.", "unknown_job", 400);
  }
  const job = await enqueue(body.type as JobType, projectId, body.input as never);
  return Response.json({ job }, { status: 201 });
});
