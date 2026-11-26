import { NotFoundError } from "@studio/shared";
import { connectDatabase } from "../connection";
import { toObjectId } from "../ids";
import { MediaAssetModel, type MediaAssetDoc, type MediaKind, type MediaOrigin, type MediaStatus } from "../models";

export interface MediaAsset {
  id: string;
  projectId: string;
  kind: MediaKind;
  origin: MediaOrigin;
  role: string | null;
  name: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  status: MediaStatus;
  error: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  waveformKey: string | null;
  thumbnailKey: string | null;
  filmstripKey: string | null;
  filmstripFrames: number;
  provider: string | null;
  prompt: string | null;
  sceneId: string | null;
  createdAt: string;
}

export function toMediaAsset(doc: MediaAssetDoc): MediaAsset {
  return {
    id: String(doc._id),
    projectId: String(doc.projectId),
    kind: doc.kind,
    origin: doc.origin,
    role: doc.role,
    name: doc.name,
    storageKey: doc.storageKey,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    status: doc.status,
    error: doc.error,
    durationSeconds: doc.durationSeconds,
    width: doc.width,
    height: doc.height,
    waveformKey: doc.waveformKey,
    thumbnailKey: doc.thumbnailKey,
    filmstripKey: doc.filmstripKey,
    filmstripFrames: doc.filmstripFrames,
    provider: doc.provider,
    prompt: doc.prompt,
    sceneId: doc.sceneId,
    createdAt: doc.createdAt.toISOString(),
  };
}

export interface CreateMediaInput {
  projectId: string;
  kind: MediaKind;
  origin: MediaOrigin;
  role?: string | null;
  name: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  provider?: string | null;
  prompt?: string | null;
  generationSettings?: Record<string, unknown>;
  sceneId?: string | null;
  status?: MediaStatus;
}

export async function createMediaAsset(input: CreateMediaInput): Promise<MediaAsset> {
  await connectDatabase();
  const doc = await MediaAssetModel.create({ ...input, projectId: toObjectId(input.projectId, "project") });
  return toMediaAsset(doc.toObject());
}

export async function getMediaAsset(id: string): Promise<MediaAsset> {
  await connectDatabase();
  const doc = await MediaAssetModel.findById(toObjectId(id, "file")).lean<MediaAssetDoc>();
  if (!doc) throw new NotFoundError("file");
  return toMediaAsset(doc);
}

export async function listMediaAssets(filter: {
  projectId?: string;
  kind?: MediaKind | MediaKind[];
  search?: string;
  ids?: string[];
  limit?: number;
}): Promise<MediaAsset[]> {
  await connectDatabase();
  const q: Record<string, unknown> = {};
  if (filter.projectId) q.projectId = toObjectId(filter.projectId, "project");
  if (filter.kind) q.kind = Array.isArray(filter.kind) ? { $in: filter.kind } : filter.kind;
  if (filter.ids) q._id = { $in: filter.ids.filter((i) => /^[a-f0-9]{24}$/.test(i)) };
  if (filter.search?.trim()) q.name = { $regex: filter.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const docs = await MediaAssetModel.find(q).sort({ createdAt: -1 }).limit(filter.limit ?? 500).lean<MediaAssetDoc[]>();
  return docs.map(toMediaAsset);
}

export async function updateMediaAsset(
  id: string,
  patch: Partial<
    Pick<
      MediaAssetDoc,
      | "name"
      | "status"
      | "error"
      | "durationSeconds"
      | "width"
      | "height"
      | "waveformKey"
      | "thumbnailKey"
      | "filmstripKey"
      | "filmstripFrames"
      | "sceneId"
      | "role"
    >
  >,
): Promise<MediaAsset> {
  await connectDatabase();
  const doc = await MediaAssetModel.findByIdAndUpdate(toObjectId(id, "file"), { $set: patch }, { returnDocument: "after", runValidators: true }).lean<MediaAssetDoc>();
  if (!doc) throw new NotFoundError("file");
  return toMediaAsset(doc);
}

export async function deleteMediaAsset(id: string): Promise<MediaAsset> {
  const asset = await getMediaAsset(id);
  await MediaAssetModel.deleteOne({ _id: toObjectId(id, "file") });
  return asset;
}

/** Changes whenever a project's media list or any file's status changes. */
export async function mediaFingerprint(projectId: string): Promise<string> {
  await connectDatabase();
  const pid = toObjectId(projectId, "project");
  const [count, latest] = await Promise.all([
    MediaAssetModel.countDocuments({ projectId: pid }),
    MediaAssetModel.findOne({ projectId: pid }, { updatedAt: 1 }).sort({ updatedAt: -1 }).lean(),
  ]);
  return `${count}:${latest?.updatedAt?.getTime() ?? 0}`;
}
