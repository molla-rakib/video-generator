import { z } from "zod";
import { AspectRatioSchema, FpsSchema, NotFoundError } from "@studio/shared";
import { createTimeline, type Timeline } from "@studio/timeline";
import { connectDatabase } from "../connection";
import { toObjectId } from "../ids";
import { GenerationJobModel, MediaAssetModel, ProjectModel, type ProjectDoc } from "../models";
import { createTimelineFile, projectFolder } from "./project-file";

export const CreateProjectInputSchema = z.object({
  title: z.string().trim().min(1, "Give your video a name.").max(160),
  language: z.string().trim().min(2).max(16).default("bn"),
  aspectRatio: AspectRatioSchema.default("9:16"),
  /** Extra shapes to export besides the one being edited. */
  ratios: z.array(AspectRatioSchema).default([]),
  fps: FpsSchema.default(30),
  style: z.string().trim().max(80).nullable().default(null),
});
export type CreateProjectInput = z.input<typeof CreateProjectInputSchema>;

export const UpdateProjectInputSchema = z
  .object({
    title: CreateProjectInputSchema.shape.title,
    language: CreateProjectInputSchema.shape.language,
    aspectRatio: AspectRatioSchema,
    fps: FpsSchema,
    style: z.string().trim().max(80).nullable(),
  })
  .partial()
  .strict();
export type UpdateProjectInput = z.input<typeof UpdateProjectInputSchema>;

export interface Project {
  id: string;
  title: string;
  language: string;
  aspectRatio: ProjectDoc["aspectRatio"];
  fps: ProjectDoc["fps"];
  style: string | null;
  thumbnailKey: string | null;
  lastActivity: string;
  createdAt: string;
  updatedAt: string;
}

function toProject(doc: ProjectDoc): Project {
  return {
    id: String(doc._id),
    title: doc.title,
    language: doc.language ?? "bn",
    // Older projects may hold values from before the project.json model.
    aspectRatio: AspectRatioSchema.catch("16:9").parse(doc.aspectRatio),
    fps: FpsSchema.catch(30).parse(doc.fps),
    style: doc.style ?? null,
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

/**
 * Create a project: an index entry in the database and a project folder
 * with an empty `project.json` (or the one given, e.g. a sample project).
 */
export async function createProject(input: CreateProjectInput, initial?: (projectId: string) => Promise<Timeline> | Timeline): Promise<Project> {
  const data = CreateProjectInputSchema.parse(input);
  await connectDatabase();
  const project = await ProjectModel.create({
    title: data.title,
    language: data.language,
    aspectRatio: data.aspectRatio,
    fps: data.fps,
    style: data.style,
    lastActivity: "Project created",
  });
  try {
    const id = String(project._id);
    const timeline = initial
      ? await initial(id)
      : createTimeline({ fps: data.fps, ratio: data.aspectRatio, ratios: [data.aspectRatio, ...data.ratios.filter((r) => r !== data.aspectRatio)], style: data.style });
    await createTimelineFile(id, timeline);
  } catch (error) {
    await ProjectModel.deleteOne({ _id: project._id }).catch(() => {});
    throw error;
  }
  return toProject(project.toObject());
}

/** Update the project's index entry (title, language…). */
export async function updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
  const patch = UpdateProjectInputSchema.parse(input);
  await connectDatabase();
  const doc = await ProjectModel.findByIdAndUpdate(toObjectId(id, "project"), { $set: patch }, { returnDocument: "after", runValidators: true }).lean<ProjectDoc>();
  if (!doc) throw new NotFoundError("project");
  return toProject(doc);
}

export async function touchProject(id: string, activity: string, extra: { thumbnailKey?: string; aspectRatio?: ProjectDoc["aspectRatio"] } = {}): Promise<void> {
  await connectDatabase();
  await ProjectModel.updateOne({ _id: toObjectId(id, "project") }, { $set: { lastActivity: activity, ...extra } });
}

/** Delete a project's records. Returns its storage prefix for file removal. */
export async function deleteProject(id: string): Promise<{ storagePrefix: string }> {
  const projectId = toObjectId(id, "project");
  await connectDatabase();
  if (!(await ProjectModel.exists({ _id: projectId }))) throw new NotFoundError("project");
  await GenerationJobModel.updateMany({ projectId, status: { $in: ["pending", "running", "paused"] } }, { $set: { cancelRequested: true, status: "cancelled" } });
  await Promise.all([MediaAssetModel.deleteMany({ projectId }), GenerationJobModel.deleteMany({ projectId })]);
  await ProjectModel.deleteOne({ _id: projectId });
  return { storagePrefix: projectFolder(id) };
}
