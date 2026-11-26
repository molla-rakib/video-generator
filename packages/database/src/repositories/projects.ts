import { z } from "zod";
import {
  AspectRatioSchema,
  FpsSchema,
  NotFoundError,
  ResolutionSchema,
  VisualStyleSchema,
  dimensionsFor,
} from "@studio/shared";
import { createTimeline, emptyScript } from "@studio/timeline";
import { connectDatabase } from "../connection";
import { toObjectId } from "../ids";
import {
  ChatMessageModel,
  GenerationJobModel,
  MediaAssetModel,
  ProjectModel,
  ScriptModel,
  TimelineModel,
  TimelineSnapshotModel,
  type ProjectDoc,
} from "../models";

export const CreateProjectInputSchema = z.object({
  title: z.string().trim().min(1, "Give your documentary a title.").max(160),
  topic: z.string().trim().max(20000).default(""),
  language: z.string().trim().min(2).max(16).default("bn"),
  aspectRatio: AspectRatioSchema.default("16:9"),
  resolution: ResolutionSchema.default("1080p"),
  fps: FpsSchema.default(30),
  visualStyle: VisualStyleSchema.default("documentary"),
});
export type CreateProjectInput = z.input<typeof CreateProjectInputSchema>;

export const UpdateProjectInputSchema = CreateProjectInputSchema.partial().strict();
export type UpdateProjectInput = z.input<typeof UpdateProjectInputSchema>;

export interface Project {
  id: string;
  title: string;
  topic: string;
  language: string;
  aspectRatio: ProjectDoc["aspectRatio"];
  resolution: ProjectDoc["resolution"];
  fps: ProjectDoc["fps"];
  visualStyle: ProjectDoc["visualStyle"];
  width: number;
  height: number;
  thumbnailKey: string | null;
  lastActivity: string;
  createdAt: string;
  updatedAt: string;
}

function toProject(doc: ProjectDoc): Project {
  const { width, height } = dimensionsFor(doc.aspectRatio, doc.resolution);
  return {
    id: String(doc._id),
    title: doc.title,
    topic: doc.topic,
    language: doc.language,
    aspectRatio: doc.aspectRatio,
    resolution: doc.resolution,
    fps: doc.fps,
    visualStyle: doc.visualStyle,
    width,
    height,
    thumbnailKey: doc.thumbnailKey,
    lastActivity: doc.lastActivity,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function listProjects(limit = 200): Promise<Project[]> {
  await connectDatabase();
  const docs = await ProjectModel.find().sort({ updatedAt: -1 }).limit(limit).lean<ProjectDoc[]>();
  return docs.map(toProject);
}

export async function getProject(id: string): Promise<Project> {
  await connectDatabase();
  const doc = await ProjectModel.findById(toObjectId(id, "project")).lean<ProjectDoc>();
  if (!doc) throw new NotFoundError("project");
  return toProject(doc);
}

/** Create a project with an empty timeline and script. */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  const data = CreateProjectInputSchema.parse(input);
  await connectDatabase();
  const project = await ProjectModel.create({ ...data, lastActivity: "Project created" });
  try {
    const { width, height } = dimensionsFor(data.aspectRatio, data.resolution);
    await TimelineModel.create({ projectId: project._id, revision: 1, data: createTimeline({ fps: data.fps, width, height }), updatedBy: "system" });
    await ScriptModel.create({ projectId: project._id, revision: 1, data: { ...emptyScript(data.language), title: data.title } });
  } catch (error) {
    await Promise.allSettled([
      ProjectModel.deleteOne({ _id: project._id }),
      TimelineModel.deleteMany({ projectId: project._id }),
      ScriptModel.deleteMany({ projectId: project._id }),
    ]);
    throw error;
  }
  return toProject(project.toObject());
}

/** Update settings. Format changes are applied to the timeline canvas too. */
export async function updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
  const patch = UpdateProjectInputSchema.parse(input);
  const projectId = toObjectId(id, "project");
  await connectDatabase();
  const doc = await ProjectModel.findByIdAndUpdate(projectId, { $set: patch }, { returnDocument: "after", runValidators: true }).lean<ProjectDoc>();
  if (!doc) throw new NotFoundError("project");
  if (patch.aspectRatio || patch.resolution || patch.fps) {
    const { width, height } = dimensionsFor(doc.aspectRatio, doc.resolution);
    const timeline = await TimelineModel.findOne({ projectId }).lean();
    if (timeline) {
      await TimelineModel.updateOne(
        { projectId },
        { $set: { data: { ...(timeline.data as object), width, height, fps: doc.fps }, updatedBy: "system" }, $inc: { revision: 1 } },
      );
    }
  }
  return toProject(doc);
}

export async function touchProject(id: string, activity: string, extra: { thumbnailKey?: string } = {}): Promise<void> {
  await connectDatabase();
  await ProjectModel.updateOne({ _id: toObjectId(id, "project") }, { $set: { lastActivity: activity, ...extra } });
}

/** Delete a project's records. Returns its storage prefix for file removal. */
export async function deleteProject(id: string): Promise<{ storagePrefix: string }> {
  const projectId = toObjectId(id, "project");
  await connectDatabase();
  if (!(await ProjectModel.exists({ _id: projectId }))) throw new NotFoundError("project");
  await GenerationJobModel.updateMany({ projectId, status: { $in: ["pending", "running"] } }, { $set: { cancelRequested: true, status: "cancelled" } });
  await Promise.all([
    TimelineModel.deleteMany({ projectId }),
    TimelineSnapshotModel.deleteMany({ projectId }),
    ScriptModel.deleteMany({ projectId }),
    MediaAssetModel.deleteMany({ projectId }),
    ChatMessageModel.deleteMany({ projectId }),
    GenerationJobModel.deleteMany({ projectId }),
  ]);
  await ProjectModel.deleteOne({ _id: projectId });
  return { storagePrefix: `projects/${id}` };
}
