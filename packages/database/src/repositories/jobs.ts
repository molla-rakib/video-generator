import { NotFoundError } from "@studio/shared";
import { connectDatabase } from "../connection";
import { toObjectId } from "../ids";
import { GenerationJobModel, type GenerationJobDoc, type JobError, type JobStatus } from "../models";

/**
 * Persistent job queue backed by MongoDB.
 *
 * - Jobs are claimed atomically with findOneAndUpdate, so several workers
 *   can run safely.
 * - Running jobs send heartbeats; a job whose worker died is returned to the
 *   queue by `recoverStaleJobs`.
 * - Failures with `retryable: true` are retried with exponential back-off up
 *   to `maxAttempts`.
 *
 * The API is intentionally small so a dedicated queue (e.g. BullMQ) can
 * replace it later without touching callers.
 */

export interface Job {
  id: string;
  projectId: string | null;
  type: string;
  title: string;
  input: Record<string, unknown>;
  status: JobStatus;
  progress: number;
  progressMessage: string;
  result: Record<string, unknown> | null;
  error: JobError | null;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
}

export function toJob(doc: GenerationJobDoc): Job {
  return {
    id: String(doc._id),
    projectId: doc.projectId ? String(doc.projectId) : null,
    type: doc.type,
    title: doc.title,
    input: doc.input,
    status: doc.status,
    progress: doc.progress,
    progressMessage: doc.progressMessage,
    result: doc.result,
    error: doc.error,
    attempts: doc.attempts,
    maxAttempts: doc.maxAttempts,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function enqueueJob(input: {
  projectId: string | null;
  type: string;
  title?: string;
  input?: Record<string, unknown>;
  maxAttempts?: number;
}): Promise<Job> {
  await connectDatabase();
  const doc = await GenerationJobModel.create({
    projectId: input.projectId ? toObjectId(input.projectId, "project") : null,
    type: input.type,
    title: input.title ?? "",
    input: input.input ?? {},
    maxAttempts: input.maxAttempts ?? 2,
  });
  return toJob(doc.toObject());
}

/** Atomically claim the oldest runnable job. Returns null if none. */
export async function claimNextJob(workerId: string, types?: string[]): Promise<Job | null> {
  await connectDatabase();
  const now = new Date();
  const filter: Record<string, unknown> = { status: "pending", runAfter: { $lte: now }, cancelRequested: false };
  if (types?.length) filter.type = { $in: types };
  const doc = await GenerationJobModel.findOneAndUpdate(
    filter,
    {
      $set: { status: "running", lockedBy: workerId, heartbeatAt: now, error: null, progress: 0, progressMessage: "" },
      $inc: { attempts: 1 },
    },
    { sort: { createdAt: 1 }, returnDocument: "after" },
  ).lean<GenerationJobDoc>();
  return doc ? toJob(doc) : null;
}

/**
 * Report real progress (0–1). Also acts as a heartbeat. Returns false when
 * the job was cancelled or taken away, so the worker can stop early.
 */
export async function reportProgress(jobId: string, workerId: string, progress: number, message = ""): Promise<boolean> {
  const res = await GenerationJobModel.updateOne(
    { _id: jobId, lockedBy: workerId, status: "running", cancelRequested: false },
    { $set: { progress: Math.min(1, Math.max(0, progress)), progressMessage: message, heartbeatAt: new Date() } },
  );
  return res.matchedCount === 1;
}

export async function completeJob(jobId: string, workerId: string, result: Record<string, unknown> = {}): Promise<void> {
  await GenerationJobModel.updateOne(
    { _id: jobId, lockedBy: workerId, status: "running" },
    { $set: { status: "completed", progress: 1, result, lockedBy: null, heartbeatAt: null } },
  );
}

/** Record a failure; retryable failures go back to the queue with back-off. */
export async function failJob(jobId: string, workerId: string, error: JobError): Promise<JobStatus> {
  const doc = await GenerationJobModel.findOne({ _id: jobId, lockedBy: workerId, status: "running" }).lean<GenerationJobDoc>();
  if (!doc) return "cancelled";
  const willRetry = error.retryable && doc.attempts < doc.maxAttempts && !doc.cancelRequested;
  const backoffMs = Math.min(5 * 60_000, 2 ** doc.attempts * 5_000);
  const status: JobStatus = willRetry ? "pending" : "failed";
  await GenerationJobModel.updateOne(
    { _id: jobId },
    {
      $set: {
        status,
        error,
        lockedBy: null,
        heartbeatAt: null,
        runAfter: willRetry ? new Date(Date.now() + backoffMs) : doc.runAfter,
      },
    },
  );
  return status;
}

/** User-initiated retry of a failed or cancelled job. */
export async function retryJob(jobId: string): Promise<Job | null> {
  await connectDatabase();
  const doc = await GenerationJobModel.findOneAndUpdate(
    { _id: toObjectId(jobId, "job"), status: { $in: ["failed", "cancelled"] } },
    { $set: { status: "pending", error: null, runAfter: new Date(), cancelRequested: false, progress: 0, progressMessage: "" }, $inc: { maxAttempts: 1 } },
    { returnDocument: "after" },
  ).lean<GenerationJobDoc>();
  return doc ? toJob(doc) : null;
}

export async function cancelJob(jobId: string): Promise<void> {
  await connectDatabase();
  const id = toObjectId(jobId, "job");
  await GenerationJobModel.updateOne({ _id: id, status: "pending" }, { $set: { status: "cancelled", cancelRequested: true } });
  // A running job is asked to stop; the worker sees it on its next progress report.
  await GenerationJobModel.updateOne({ _id: id, status: "running" }, { $set: { cancelRequested: true } });
}

/** Called by the worker after it stops a job because cancellation was requested. */
export async function markCancelled(jobId: string): Promise<void> {
  await GenerationJobModel.updateOne(
    { _id: jobId, status: "running" },
    { $set: { status: "cancelled", lockedBy: null, heartbeatAt: null } },
  );
}

/**
 * "Still alive" without changing progress — sent on a timer while a job
 * runs, so long quiet steps (an agent thinking for minutes) aren't mistaken
 * for a dead worker.
 */
export async function sendHeartbeat(jobId: string, workerId: string): Promise<void> {
  await GenerationJobModel.updateOne({ _id: jobId, lockedBy: workerId, status: "running" }, { $set: { heartbeatAt: new Date() } });
}

/**
 * Jobs that pick up where they stopped (they keep their own progress), so an
 * interruption should continue them rather than fail them. They're limited to
 * a number of continuations so a job that keeps crashing still ends.
 */
export const RESUMABLE_JOB_TYPES = ["agent.generate"];
const MAX_CONTINUATIONS = 10;

/** Put an interrupted job back in the queue to continue (it may run once more). */
async function continueLater(doc: GenerationJobDoc, message: string): Promise<void> {
  await GenerationJobModel.updateOne(
    { _id: doc._id, status: "running" },
    {
      $set: {
        status: "pending",
        lockedBy: null,
        heartbeatAt: null,
        runAfter: new Date(),
        progressMessage: message,
        maxAttempts: Math.max(doc.maxAttempts, doc.attempts + 1),
      },
    },
  );
}

/**
 * When a worker starts: jobs that an earlier worker on this computer was
 * running were cut off (restart, crash, app closed). Resumable ones go back
 * in the queue to continue; others follow the normal retry rules.
 */
export async function recoverInterruptedJobs(host: string, currentWorkerId: string): Promise<number> {
  await connectDatabase();
  const docs = await GenerationJobModel.find({ status: "running", lockedBy: { $regex: `^${host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`, $ne: currentWorkerId } }).lean<GenerationJobDoc[]>();
  for (const doc of docs) {
    if (RESUMABLE_JOB_TYPES.includes(doc.type) && doc.attempts < MAX_CONTINUATIONS) await continueLater(doc, "Continuing after a restart");
    else
      await GenerationJobModel.updateOne(
        { _id: doc._id, status: "running" },
        doc.attempts < doc.maxAttempts
          ? { $set: { status: "pending", lockedBy: null, heartbeatAt: null, runAfter: new Date() } }
          : { $set: { status: "failed", lockedBy: null, heartbeatAt: null, error: { userMessage: "This task was interrupted. You can try again.", detail: "worker restarted", retryable: true } } },
      );
  }
  return docs.length;
}

/** Return jobs whose worker stopped sending heartbeats to the queue. */
export async function recoverStaleJobs(staleAfterMs = 120_000): Promise<number> {
  await connectDatabase();
  const cutoff = new Date(Date.now() - staleAfterMs);
  const stale = { status: "running" as const, heartbeatAt: { $lt: cutoff } };
  // Resumable jobs continue instead of failing.
  const resumable = await GenerationJobModel.find({ ...stale, type: { $in: RESUMABLE_JOB_TYPES }, attempts: { $lt: MAX_CONTINUATIONS } }).lean<GenerationJobDoc[]>();
  for (const doc of resumable) await continueLater(doc, "Continuing after an interruption");
  const requeued = await GenerationJobModel.updateMany(
    { ...stale, $expr: { $lt: ["$attempts", "$maxAttempts"] } },
    { $set: { status: "pending", lockedBy: null, heartbeatAt: null, runAfter: new Date() } },
  );
  const failed = await GenerationJobModel.updateMany(stale, {
    $set: {
      status: "failed",
      lockedBy: null,
      heartbeatAt: null,
      error: { userMessage: "This task stopped unexpectedly. You can try again.", detail: "worker heartbeat lost", retryable: true },
    },
  });
  return resumable.length + requeued.modifiedCount + failed.modifiedCount;
}

export async function listJobs(projectId: string, options: { statuses?: JobStatus[]; limit?: number } = {}): Promise<Job[]> {
  await connectDatabase();
  const filter: Record<string, unknown> = { projectId: toObjectId(projectId, "project") };
  if (options.statuses?.length) filter.status = { $in: options.statuses };
  const docs = await GenerationJobModel.find(filter).sort({ createdAt: -1 }).limit(options.limit ?? 100).lean<GenerationJobDoc[]>();
  return docs.map(toJob);
}


export async function getJob(jobId: string): Promise<Job> {
  await connectDatabase();
  const doc = await GenerationJobModel.findById(toObjectId(jobId, "task")).lean<GenerationJobDoc>();
  if (!doc) throw new NotFoundError("task");
  return toJob(doc);
}

/** Jobs that are waiting or running, plus ones finished in the last few minutes. */
export async function listRecentJobs(projectId: string, sinceMs = 10 * 60_000): Promise<Job[]> {
  await connectDatabase();
  const docs = await GenerationJobModel.find({
    projectId: toObjectId(projectId, "project"),
    $or: [{ status: { $in: ["pending", "running"] } }, { updatedAt: { $gte: new Date(Date.now() - sinceMs) } }],
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean<GenerationJobDoc[]>();
  return docs.map(toJob);
}

export async function isCancelRequested(jobId: string): Promise<boolean> {
  const doc = await GenerationJobModel.findById(jobId, { cancelRequested: 1 }).lean();
  return Boolean(doc?.cancelRequested);
}
