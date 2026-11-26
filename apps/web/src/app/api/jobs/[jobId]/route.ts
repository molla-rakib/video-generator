import type { NextRequest } from "next/server";
import { cancelJob, getJob, retryJob } from "@studio/database";
import { UserFacingError } from "@studio/shared";
import { apiHandler } from "@/lib/server/api";

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

/** Cancel a waiting or running task. */
export const DELETE = apiHandler(async (_request: NextRequest, ctx: Context) => {
  const { jobId } = await ctx.params;
  await cancelJob(jobId);
  return Response.json({ job: await getJob(jobId) });
});
