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

/** Jobs the editor may start directly. */
const STARTABLE: JobType[] = ["render", "agent.revise"];

export const POST = apiHandler(async (request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  await getProject(projectId);
  const body = z.object({ type: z.string(), input: z.record(z.string(), z.unknown()).default({}) }).parse(await readJson(request));
  if (!STARTABLE.includes(body.type as JobType) || !(body.type in JOB_INPUTS)) {
    throw new UserFacingError("That action isn't available.", "unknown_job", 400);
  }
  if (body.type === "agent.revise") {
    const jobs = await listRecentJobs(projectId);
    if (jobs.some((j) => j.type === "agent.revise" && (j.status === "pending" || j.status === "running"))) {
      throw new UserFacingError("Claude is already working on this video. Wait for it to finish, or cancel it first.", "agent_busy", 409);
    }
  }
  const request_ = typeof body.input.request === "string" ? body.input.request.trim() : "";
  const title = body.type === "agent.revise" ? `Claude: “${request_.length > 48 ? `${request_.slice(0, 47)}…` : request_}”` : undefined;
  const job = await enqueue(body.type as JobType, projectId, body.input as never, title);
  return Response.json({ job }, { status: 201 });
});
