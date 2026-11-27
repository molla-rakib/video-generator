import os from "node:os";
import {
  claimNextJob,
  completeJob,
  connectDatabase,
  failJob,
  markCancelled,
  parseJobInput,
  recoverStaleJobs,
  type Job,
  type JobType,
} from "@studio/database";
import { ProviderError } from "@studio/providers";
import { UserFacingError } from "@studio/shared";
import { createContext, JobCancelledError } from "./context";
import { runAgentRevise } from "./jobs/agent";
import { runMediaProcess } from "./jobs/media";
import { runRender } from "./jobs/render";
import { startMediaServer } from "./static-server";

/**
 * Studio background worker.
 *
 * Claims jobs from MongoDB and runs them: media processing and Remotion
 * exports. Exports run one at a time; other work runs a few jobs in parallel.
 */

const WORKER_ID = `${os.hostname()}:${process.pid}`;
const MAX_PARALLEL = Number(process.env.WORKER_CONCURRENCY ?? 3);
const POLL_MS = 1000;

let running = 0;
let renderRunning = false;
let stopping = false;

async function main() {
  await connectDatabase();
  const media = await startMediaServer();
  console.log(`[worker] ${WORKER_ID} ready (up to ${MAX_PARALLEL} parallel jobs)`);

  setInterval(() => {
    recoverStaleJobs().then((n) => n && console.log(`[worker] returned ${n} stalled job(s) to the queue`)).catch(() => {});
  }, 60_000);

  const handlers: Record<JobType, (job: Job, ctx: ReturnType<typeof createContext>) => Promise<Record<string, unknown>>> = {
    "media.process": (job, ctx) => runMediaProcess(ctx, parseJobInput("media.process", job.input)),
    render: (job, ctx) => runRender(ctx, parseJobInput("render", job.input), media),
    "agent.revise": (job, ctx) => runAgentRevise(ctx, parseJobInput("agent.revise", job.input)),
  };
  const allTypes = Object.keys(handlers);

  const execute = async (job: Job) => {
    const started = Date.now();
    const ctx = createContext(job, WORKER_ID);
    console.log(`[worker] ▶ ${job.type} ${job.id}`);
    try {
      const handler = handlers[job.type as JobType];
      if (!handler) throw new Error(`Unknown job type ${job.type}`);
      const result = await handler(job, ctx);
      await completeJob(job.id, WORKER_ID, result);
      console.log(`[worker] ✓ ${job.type} ${job.id} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (error) {
      if (error instanceof JobCancelledError) {
        await markCancelled(job.id);
        console.log(`[worker] ■ ${job.type} ${job.id} cancelled`);
        return;
      }
      const userMessage =
        error instanceof UserFacingError ? error.message : "Something went wrong while doing this. You can try again.";
      const detail = error instanceof ProviderError ? `${error.message} ${error.detail}` : error instanceof Error ? (error.stack ?? error.message) : String(error);
      const retryable = error instanceof ProviderError ? error.retryable : !(error instanceof UserFacingError);
      await failJob(job.id, WORKER_ID, { userMessage, detail: detail.slice(0, 4000), retryable });
      console.error(`[worker] ✗ ${job.type} ${job.id}: ${detail.split("\n")[0]}`);
    }
  };

  while (!stopping) {
    try {
      if (running < MAX_PARALLEL) {
        const types = renderRunning ? allTypes.filter((t) => t !== "render") : allTypes;
        const job = await claimNextJob(WORKER_ID, types);
        if (job) {
          running++;
          const isRender = job.type === "render";
          if (isRender) renderRunning = true;
          void execute(job).finally(() => {
            running--;
            if (isRender) renderRunning = false;
          });
          continue;
        }
      }
    } catch (error) {
      console.error("[worker] queue error:", error instanceof Error ? error.message : error);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  media.close();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    console.log(`[worker] stopping after ${running} running job(s)…`);
    setTimeout(() => process.exit(0), running ? 5000 : 0);
  });
}

main().catch((error) => {
  console.error("[worker] failed to start:", error instanceof Error ? error.message : error);
  process.exit(1);
});
