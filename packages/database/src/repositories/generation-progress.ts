import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

/**
 * GENERATION PROGRESS — plan/progress.json
 *
 * What "Start animating" has finished, so a stopped, failed or interrupted
 * run continues where it left off instead of starting again. See
 * docs/GENERATION_RESUME.md.
 *
 * Each step is trusted only while its output is still on disk and unchanged
 * (by hash), and only while the inputs it was made from are unchanged.
 */

const Status = z.enum(["todo", "running", "done", "failed"]);
export type StepStatus = z.infer<typeof Status>;

const ComponentState = z.object({
  status: Status.default("todo"),
  hash: z.string().optional(),
  error: z.string().optional(),
});

export const ProgressSchema = z.object({
  version: z.literal(1),
  /** Fingerprints of what the plan was made from. */
  inputs: z.object({ subtitles: z.string(), voice: z.string(), references: z.string(), style: z.string(), notes: z.string() }),
  /** Whole-project backup taken before the very first step (for Undo). */
  backup: z.string().nullable().default(null),
  /** The Claude process currently working, so a leftover one can be stopped. */
  agentPid: z.number().nullable().default(null),
  plan: z.object({ status: Status.default("todo"), hash: z.string().optional(), sessionId: z.string().optional() }).default({ status: "todo" }),
  build: z
    .object({
      status: Status.default("todo"),
      sessionId: z.string().optional(),
      manifestHash: z.string().optional(),
      components: z.record(z.string(), ComponentState).default({}),
    })
    .default({ status: "todo", components: {} }),
  review: z.object({ status: Status.default("todo"), shotsHash: z.string().optional() }).default({ status: "todo" }),
  sound: z
    .object({
      status: Status.default("todo"),
      /** Sounds already made, by key, so a retry never pays twice. */
      made: z.record(z.string(), z.object({ path: z.string(), kind: z.enum(["sfx", "music"]) })).default({}),
    })
    .default({ status: "todo", made: {} }),
  summary: z.string().default(""),
  updatedAt: z.string().default(""),
});
export type Progress = z.infer<typeof ProgressSchema>;
export type GenerationInputs = Progress["inputs"];

export const progressPath = (dir: string) => path.join(dir, "plan", "progress.json");

export const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex").slice(0, 16);

export async function hashFile(file: string): Promise<string | null> {
  try {
    return sha(await readFile(file));
  } catch {
    return null;
  }
}

/** Fingerprint a folder by its file names and sizes (cheap; reference images and assets). */
async function hashFolder(dir: string): Promise<string> {
  const parts: string[] = [];
  const walk = async (d: string, rel: string) => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(path.join(d, e.name), r);
      else parts.push(`${r}:${(await stat(path.join(d, e.name)).catch(() => null))?.size ?? 0}`);
    }
  };
  await walk(dir, "");
  return sha(parts.sort().join("|"));
}

export async function currentInputs(dir: string, voicePath: string, style: string, notes: string): Promise<GenerationInputs> {
  const [subtitles, voiceInfo, references, assets] = await Promise.all([
    hashFile(path.join(dir, "input", "subtitles.json")),
    stat(path.join(dir, ...voicePath.split("/"))).catch(() => null),
    hashFolder(path.join(dir, "input", "references")),
    hashFolder(path.join(dir, "input", "assets")),
  ]);
  return {
    subtitles: subtitles ?? "",
    // Size + name is enough to notice a different recording without hashing hundreds of MB.
    voice: sha(`${voicePath}:${voiceInfo?.size ?? 0}`),
    references: sha(`${references}|${assets}`),
    style,
    notes,
  };
}

export function freshProgress(inputs: GenerationInputs): Progress {
  return ProgressSchema.parse({ version: 1, inputs });
}

export async function loadProgress(dir: string): Promise<Progress | null> {
  try {
    return ProgressSchema.parse(JSON.parse(await readFile(progressPath(dir), "utf8")));
  } catch {
    return null;
  }
}

/** Write atomically, so a crash mid-write never leaves a broken file. */
export async function saveProgress(dir: string, progress: Progress): Promise<void> {
  progress.updatedAt = new Date().toISOString();
  const tmp = `${progressPath(dir)}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(progress, null, 2), "utf8");
  await rename(tmp, progressPath(dir));
}

export const sameInputs = (a: GenerationInputs, b: GenerationInputs) =>
  a.subtitles === b.subtitles && a.voice === b.voice && a.references === b.references && a.style === b.style && a.notes === b.notes;

/** A short, user-facing summary for the editor ("Continue animating" button). */
export function describeProgress(p: Progress | null) {
  if (!p) return { exists: false as const };
  const components = Object.values(p.build.components);
  const phase = p.plan.status !== "done" ? "plan" : p.build.status !== "done" ? "build" : p.review.status !== "done" ? "review" : p.sound.status !== "done" ? "sound" : "done";
  return {
    exists: true as const,
    complete: phase === "done",
    phase,
    components: { done: components.filter((c) => c.status === "done").length, total: components.length },
    sounds: Object.keys(p.sound.made).length,
    updatedAt: p.updatedAt,
  };
}
