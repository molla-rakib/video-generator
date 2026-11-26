import { z } from "zod";
import { enqueueJob, type Job } from "./repositories/jobs";

/**
 * Every kind of background work, with its input schema and the
 * plain-language title shown to the user while it runs.
 */
export const JOB_INPUTS = {
  "media.process": z.object({ assetId: z.string(), shotId: z.string().nullable().default(null) }),
  "story.write": z.object({
    topic: z.string().min(1),
    instructions: z.string().default(""),
    targetMinutes: z.number().min(0.5).max(60).default(5),
  }),
  "voice.generate": z.object({ sceneIds: z.array(z.string()).default([]) }),
  "subtitles.generate": z.object({ clipIds: z.array(z.string()).default([]) }),
  "storyboard.plan": z.object({ sceneIds: z.array(z.string()).default([]), generateImages: z.boolean().default(true) }),
  "images.generate": z.object({ sceneIds: z.array(z.string()).default([]), shotIds: z.array(z.string()).default([]) }),
  render: z.object({
    format: z.enum(["mp4", "webm"]).default("mp4"),
    resolution: z.enum(["1080p", "720p"]).default("1080p"),
    fps: z.union([z.literal(24), z.literal(25), z.literal(30)]).optional(),
  }),
  "assistant.turn": z.object({ messageId: z.string(), text: z.string() }),
} as const;

export type JobType = keyof typeof JOB_INPUTS;
export type JobInput<T extends JobType> = z.infer<(typeof JOB_INPUTS)[T]>;

export const JOB_TITLES: Record<JobType, string> = {
  "media.process": "Preparing a file",
  "story.write": "Writing the script",
  "voice.generate": "Generating Bangla narration",
  "subtitles.generate": "Creating subtitles",
  "storyboard.plan": "Planning the visuals",
  "images.generate": "Creating pictures",
  render: "Rendering the documentary",
  "assistant.turn": "AI assistant is working",
};

const RETRIES: Partial<Record<JobType, number>> = { render: 1, "assistant.turn": 1, "media.process": 2 };

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
