import type { NextRequest } from "next/server";
import { z } from "zod";
import { cancelJob, getJob, listRecentJobs, pauseJob, resumeJob, retryJob } from "@studio/database";
import { UserFacingError } from "@studio/shared";
import { apiHandler, readJson } from "@/lib/server/api";

type Context = RouteContext<"/api/jobs/[jobId]">;

export const GET = apiHandler(async (_request: NextRequest, ctx: Context) => {
  const { jobId } = await ctx.params;
  return Response.json({ job: await getJob(jobId) });
});

/** Retry a failed or cancelled task. */
export const POST = apiHandler(async (_request: NextRequest, ctx: Context) => {
  const { jobId } = await ctx.params;
  const job = await retryJob(jobId);
  if (!job) throw new UserFacingError("Only failed or cancelled tasks can be retried.", "not_retryable", 409);
  return Response.json({ job });
});

/** Pause or resume an animation task. Body: { action: "pause" | "resume" }. */
export const PATCH = apiHandler(async (request: NextRequest, ctx: Context) => {
  const { jobId } = await ctx.params;
  const { action } = z.object({ action: z.enum(["pause", "resume"]) }).parse(await readJson(request));
  if (action === "pause") {
    if (!(await pauseJob(jobId))) throw new UserFacingError("This task can't be paused.", "not_pausable", 409);
    return Response.json({ job: await getJob(jobId) });
  }
  const paused = await getJob(jobId);
  if (paused.projectId) {
    const jobs = await listRecentJobs(paused.projectId);
    if (jobs.some((j) => j.id !== jobId && (j.type === "agent.revise" || j.type === "agent.generate") && (j.status === "pending" || j.status === "running"))) {
      throw new UserFacingError("Claude is busy with another change. Resume when it’s finished.", "agent_busy", 409);
    }
  }
  const job = await resumeJob(jobId);
  if (!job) throw new UserFacingError("Only a paused task can be resumed.", "not_paused", 409);
  return Response.json({ job });
});

/** Cancel a waiting, running or paused task. */
export const DELETE = apiHandler(async (_request: NextRequest, ctx: Context) => {
  const { jobId } = await ctx.params;
  await cancelJob(jobId);
  return Response.json({ job: await getJob(jobId) });
});
