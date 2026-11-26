import { NotFoundError, UserFacingError } from "@studio/shared";
import { ScriptSchema, type Script } from "@studio/timeline";
import { connectDatabase } from "../connection";
import { toObjectId } from "../ids";
import { ScriptModel, type ScriptDoc } from "../models";

export interface StoredScript {
  revision: number;
  script: Script;
  updatedAt: string;
}

function toStored(doc: ScriptDoc): StoredScript {
  return { revision: doc.revision, script: ScriptSchema.parse(doc.data), updatedAt: doc.updatedAt.toISOString() };
}

export async function getScript(projectId: string): Promise<StoredScript> {
  await connectDatabase();
  const doc = await ScriptModel.findOne({ projectId: toObjectId(projectId, "project") }).lean<ScriptDoc>();
  if (!doc) throw new NotFoundError("script");
  return toStored(doc);
}

export async function saveScript(projectId: string, data: unknown, baseRevision: number): Promise<StoredScript> {
  const script = ScriptSchema.parse(data);
  const pid = toObjectId(projectId, "project");
  await connectDatabase();
  const doc = await ScriptModel.findOneAndUpdate(
    { projectId: pid, revision: baseRevision },
    { $set: { data: script }, $inc: { revision: 1 } },
    { returnDocument: "after" },
  ).lean<ScriptDoc>();
  if (!doc) {
    throw new UserFacingError(
      "The script was changed somewhere else (perhaps by the AI assistant). Reload to see the latest version.",
      "script_conflict",
      409,
    );
  }
  return toStored(doc);
}

/** Read-modify-write with retries, for agents and jobs. */
export async function updateScript(projectId: string, mutate: (script: Script) => Script): Promise<StoredScript> {
  for (let attempt = 0; ; attempt++) {
    const current = await getScript(projectId);
    try {
      return await saveScript(projectId, mutate(structuredClone(current.script)), current.revision);
    } catch (error) {
      if (error instanceof UserFacingError && error.code === "script_conflict" && attempt < 4) continue;
      throw error;
    }
  }
}

export async function getScriptRevision(projectId: string): Promise<number> {
  await connectDatabase();
  const doc = await ScriptModel.findOne({ projectId: toObjectId(projectId, "project") }, { revision: 1 }).lean();
  if (!doc) throw new NotFoundError("script");
  return doc.revision;
}
