import { getStorage, normaliseKey } from "@studio/media";
import { NotFoundError, UserFacingError } from "@studio/shared";
import { parseTimeline, type Timeline } from "@studio/timeline";
import { ZodError } from "zod";

/**
 * `project.json` on disk — the timeline's single source of truth.
 *
 * It lives in the project folder (`projects/<id>/project.json` under the
 * storage root) so an external agent can read and write it directly. Saves
 * are optimistic: the caller says which version it edited (its
 * fingerprint), and a save is refused if the file changed since — whether
 * the editor in another tab, a background job or the agent changed it.
 */

export interface StoredTimeline {
  /** Changes whenever the file changes, by anyone. */
  fingerprint: string;
  revision: number;
  timeline: Timeline;
  updatedBy: Timeline["updatedBy"];
  updatedAt: string;
}

export class TimelineConflictError extends UserFacingError {
  constructor() {
    super(
      "The project was changed somewhere else (another tab, a background task or the AI agent). Reload to get the latest version.",
      "timeline_conflict",
      409,
    );
  }
}

export class InvalidProjectFileError extends UserFacingError {
  constructor(readonly detail: string) {
    super(`project.json has a problem and can't be opened: ${detail}`, "invalid_project_file", 422);
  }
}

export const projectFolder = (projectId: string) => normaliseKey(`projects/${projectId}`);
export const projectFileKey = (projectId: string) => `${projectFolder(projectId)}/project.json`;

/** Storage key of a file inside the project folder (`src` paths in project.json). */
export function projectFile(projectId: string, relativePath: string): string {
  return normaliseKey(`${projectFolder(projectId)}/${relativePath}`);
}

// Serialise read-check-write per project inside this process.
const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(projectId) ?? Promise.resolve();
  const run = previous.catch(() => {}).then(fn);
  locks.set(projectId, run);
  try {
    return await run;
  } finally {
    if (locks.get(projectId) === run) locks.delete(projectId);
  }
}

async function readText(key: string): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of getStorage().read(key)) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function describeZod(error: ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".") || "(root)"}: ${issue.message}` : "unknown problem";
}

export async function timelineFingerprint(projectId: string): Promise<string> {
  const info = await getStorage().stat(projectFileKey(projectId));
  if (!info) throw new NotFoundError("project file");
  return `${info.modifiedAt.getTime()}:${info.sizeBytes}`;
}

export async function getTimeline(projectId: string): Promise<StoredTimeline> {
  const key = projectFileKey(projectId);
  const info = await getStorage().stat(key);
  if (!info) throw new NotFoundError("project file");
  let raw: unknown;
  try {
    raw = JSON.parse(await readText(key));
  } catch {
    throw new InvalidProjectFileError("it is not valid JSON.");
  }
  let timeline: Timeline;
  try {
    timeline = parseTimeline(raw);
  } catch (error) {
    throw new InvalidProjectFileError(error instanceof ZodError ? describeZod(error) : "it doesn't match the expected format.");
  }
  return {
    fingerprint: `${info.modifiedAt.getTime()}:${info.sizeBytes}`,
    revision: timeline.revision,
    timeline,
    updatedBy: timeline.updatedBy,
    updatedAt: info.modifiedAt.toISOString(),
  };
}

async function write(projectId: string, timeline: Timeline): Promise<StoredTimeline> {
  const key = projectFileKey(projectId);
  await getStorage().put(key, Buffer.from(JSON.stringify(timeline, null, 2) + "\n", "utf8"));
  const info = await getStorage().stat(key);
  return {
    fingerprint: `${info!.modifiedAt.getTime()}:${info!.sizeBytes}`,
    revision: timeline.revision,
    timeline,
    updatedBy: timeline.updatedBy,
    updatedAt: info!.modifiedAt.toISOString(),
  };
}

/** Write a brand-new project file (refuses to overwrite one). */
export async function createTimelineFile(projectId: string, timeline: Timeline): Promise<StoredTimeline> {
  if (await getStorage().stat(projectFileKey(projectId))) throw new UserFacingError("This project already has a project.json.");
  return write(projectId, parseTimeline(timeline));
}

/**
 * Save the timeline if nobody changed the file since `baseFingerprint`.
 * The data is validated first; an invalid timeline is never written.
 */
export async function saveTimeline(
  projectId: string,
  data: unknown,
  baseFingerprint: string,
  updatedBy: Timeline["updatedBy"] = "user",
): Promise<StoredTimeline> {
  const parsed = parseTimeline(data);
  return withLock(projectId, async () => {
    const current = await getTimeline(projectId);
    if (current.fingerprint !== baseFingerprint) throw new TimelineConflictError();
    return write(projectId, { ...parsed, revision: current.revision + 1, updatedBy });
  });
}

/**
 * Read-modify-write from the latest state. Used by background jobs, which
 * compute their change from whatever is on disk right now.
 */
export async function updateTimeline(
  projectId: string,
  mutate: (timeline: Timeline) => Timeline,
  updatedBy: Timeline["updatedBy"] = "system",
): Promise<StoredTimeline> {
  return withLock(projectId, async () => {
    const current = await getTimeline(projectId);
    const next = parseTimeline(mutate(structuredClone(current.timeline)));
    return write(projectId, { ...next, revision: current.revision + 1, updatedBy });
  });
}

const HISTORY_LIMIT = 30;

/** Keep a restorable copy of the current project file (before renders, risky changes…). */
export async function snapshotTimeline(projectId: string, reason: string): Promise<void> {
  const current = await getTimeline(projectId);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = reason.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "snapshot";
  await getStorage().put(
    `${projectFolder(projectId)}/history/${stamp}_${slug}.json`,
    Buffer.from(JSON.stringify(current.timeline, null, 2), "utf8"),
  );
  await pruneHistory(projectId);
}

async function pruneHistory(projectId: string): Promise<void> {
  const { readdir, rm } = await import("node:fs/promises");
  const dir = await getStorage().localPath(`${projectFolder(projectId)}/history/x.json`).then((p) => p.slice(0, -"x.json".length));
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".json")).sort();
  for (const f of files.slice(0, Math.max(0, files.length - HISTORY_LIMIT))) await rm(dir + f, { force: true });
}

/**
 * Which of these project-relative paths exist on disk. Used before export
 * and by the editor to flag missing files.
 */
export async function existingProjectFiles(projectId: string, paths: readonly string[]): Promise<Set<string>> {
  const storage = getStorage();
  const found = new Set<string>();
  await Promise.all(
    paths.map(async (p) => {
      try {
        if (await storage.stat(projectFile(projectId, p))) found.add(p);
      } catch {
        // Invalid path — treat as missing.
      }
    }),
  );
  return found;
}
