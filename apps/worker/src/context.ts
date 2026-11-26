import { isCancelRequested, reportProgress, type Job } from "@studio/database";
import { UserFacingError } from "@studio/shared";

export class JobCancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "JobCancelledError";
  }
}

/** Tools a job handler uses to report real progress and notice cancellation. */
export interface JobContext {
  job: Job;
  projectId: string;
  /** Report progress (0–1) with a short message. Throws if cancelled. */
  progress(value: number, message: string): Promise<void>;
  /** Throws JobCancelledError if the user cancelled. */
  checkCancelled(): Promise<void>;
  cancelled(): Promise<boolean>;
}

export function createContext(job: Job, workerId: string): JobContext {
  if (!job.projectId) throw new Error("Job has no project");
  return {
    job,
    projectId: job.projectId,
    async progress(value, message) {
      const stillMine = await reportProgress(job.id, workerId, value, message);
      if (!stillMine) throw new JobCancelledError();
    },
    async checkCancelled() {
      if (await isCancelRequested(job.id)) throw new JobCancelledError();
    },
    cancelled: () => isCancelRequested(job.id),
  };
}

/** A failure whose message is meant for the user. */
export function userError(message: string): UserFacingError {
  return new UserFacingError(message, "job_failed", 400);
}
