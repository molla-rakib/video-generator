import { NotFoundError, UserFacingError } from "@studio/shared";
import { parseTimeline, type Timeline } from "@studio/timeline";
import { connectDatabase } from "../connection";
import { toObjectId } from "../ids";
import { TimelineModel, TimelineSnapshotModel, type TimelineDoc } from "../models";

export interface StoredTimeline {
  revision: number;
  timeline: Timeline;
  updatedBy: TimelineDoc["updatedBy"];
  updatedAt: string;
}

export class TimelineConflictError extends UserFacingError {
  constructor(readonly currentRevision: number) {
    super(
      "The timeline was changed somewhere else (perhaps by the AI assistant or another tab). Reload to get the latest version.",
      "timeline_conflict",
      409,
    );
  }
}

function toStored(doc: TimelineDoc): StoredTimeline {
  return { revision: doc.revision, timeline: parseTimeline(doc.data), updatedBy: doc.updatedBy, updatedAt: doc.updatedAt.toISOString() };
}

export async function getTimeline(projectId: string): Promise<StoredTimeline> {
  await connectDatabase();
  const doc = await TimelineModel.findOne({ projectId: toObjectId(projectId, "project") }).lean<TimelineDoc>();
  if (!doc) throw new NotFoundError("timeline");
  return toStored(doc);
}

/** Lightweight check used by the editor to notice outside changes. */
export async function getTimelineRevision(projectId: string): Promise<number> {
  await connectDatabase();
  const doc = await TimelineModel.findOne({ projectId: toObjectId(projectId, "project") }, { revision: 1 }).lean();
  if (!doc) throw new NotFoundError("timeline");
  return doc.revision;
}

/**
 * Save the timeline if nobody else saved since `baseRevision`. The data is
 * validated before it is written; an invalid timeline is never stored.
 */
export async function saveTimeline(
  projectId: string,
  data: unknown,
  baseRevision: number,
  updatedBy: TimelineDoc["updatedBy"] = "user",
): Promise<StoredTimeline> {
  const timeline = parseTimeline(data);
  const pid = toObjectId(projectId, "project");
  await connectDatabase();
  const doc = await TimelineModel.findOneAndUpdate(
    { projectId: pid, revision: baseRevision },
    { $set: { data: timeline, updatedBy }, $inc: { revision: 1 } },
    { returnDocument: "after" },
  ).lean<TimelineDoc>();
  if (!doc) {
    const current = await TimelineModel.findOne({ projectId: pid }, { revision: 1 }).lean();
    if (!current) throw new NotFoundError("timeline");
    throw new TimelineConflictError(current.revision);
  }
  return toStored(doc);
}

/**
 * Read-modify-write with automatic retry on conflicts. Used by agents and
 * background jobs, which compute their change from the latest state.
 */
export async function updateTimeline(
  projectId: string,
  mutate: (timeline: Timeline) => Timeline,
  updatedBy: TimelineDoc["updatedBy"] = "system",
): Promise<StoredTimeline> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await getTimeline(projectId);
    try {
      return await saveTimeline(projectId, mutate(structuredClone(current.timeline)), current.revision, updatedBy);
    } catch (error) {
      if (error instanceof TimelineConflictError && attempt < 4) continue;
      throw error;
    }
  }
  throw new TimelineConflictError(-1);
}

/** Keep a copy of the current timeline (before risky changes, renders, locks). */
export async function snapshotTimeline(projectId: string, reason: string): Promise<void> {
  const current = await getTimeline(projectId);
  await TimelineSnapshotModel.create({
    projectId: toObjectId(projectId, "project"),
    revision: current.revision,
    reason,
    data: current.timeline,
  });
}

export async function listSnapshots(projectId: string, limit = 30) {
  await connectDatabase();
  const docs = await TimelineSnapshotModel.find({ projectId: toObjectId(projectId, "project") }, { data: 0 })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return docs.map((d) => ({ id: String(d._id), revision: d.revision, reason: d.reason, createdAt: d.createdAt.toISOString() }));
}
