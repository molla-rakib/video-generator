import { z } from "zod";
import { AspectRatioSchema, FpsSchema, ResolutionSchema } from "@studio/shared";
import { enqueueJob, type Job } from "./repositories/jobs";

/**
 * Every kind of background work, with its input schema and the
 * plain-language title shown to the user while it runs.
 */
export const JOB_INPUTS = {
  "media.process": z.object({ assetId: z.string() }),
  /** Export one video per aspect ratio. */
  render: z.object({
    ratios: z.array(AspectRatioSchema).min(1),
    resolution: ResolutionSchema.default("1080p"),
    format: z.enum(["mp4", "webm"]).default("mp4"),
    fps: FpsSchema.optional(),
  }),
  /** Animate the whole story from the voiceover and subtitles. */
  "agent.generate": z.object({
    /** Optional extra direction from the user. */
    notes: z.string().trim().max(4000).default(""),
    /** "continue" picks up where an earlier run stopped; "restart" throws that work away. */
    mode: z.enum(["continue", "restart"]).default("continue"),
  }),
  /** Ask the AI agent to change part of the video. */
  "agent.revise": z.object({
    request: z.string().trim().min(2).max(4000),
    /** Clips the user selected on the timeline. */
    clipIds: z.array(z.string()).max(200).default([]),
    /** Time range the user selected (seconds), if any. */
    range: z.object({ start: z.number().nonnegative(), end: z.number().positive() }).nullable().default(null),
  }),
} as const;

export type JobType = keyof typeof JOB_INPUTS;
export type JobInput<T extends JobType> = z.infer<(typeof JOB_INPUTS)[T]>;

export const JOB_TITLES: Record<JobType, string> = {
  "media.process": "Preparing a file",
  render: "Exporting the video",
  "agent.revise": "Claude is changing your video",
  "agent.generate": "Claude is animating your story",
};

// Agent jobs are never retried automatically: each run costs plan usage.
const RETRIES: Partial<Record<JobType, number>> = { render: 1, "media.process": 2, "agent.revise": 1, "agent.generate": 1 };

export async function enqueue<T extends JobType>(
  type: T,
  projectId: string,
  input: z.input<(typeof JOB_INPUTS)[T]>,
  title?: string,
): Promise<Job> {
  const parsed = JOB_INPUTS[type].parse(input) as Record<string, unknown>;
  return enqueueJob({ projectId, type, title: title ?? JOB_TITLES[type], input: parsed, maxAttempts: RETRIES[type] ?? 2 });
}

export function parseJobInput<T extends JobType>(type: T, input: unknown): JobInput<T> {
  return JOB_INPUTS[type].parse(input) as JobInput<T>;
}
