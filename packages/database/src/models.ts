import mongoose, { Schema, type Model, type Types } from "mongoose";
import { ASPECT_RATIOS, RESOLUTIONS, VISUAL_STYLES, type AspectRatio, type Resolution, type VisualStyle } from "@studio/shared";

/**
 * MongoDB collections. Media bytes never live here — only storage keys and
 * metadata. Large/fast-changing data has its own collection.
 */

function defineModel<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface ProjectDoc {
  _id: Types.ObjectId;
  title: string;
  topic: string;
  language: string;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  fps: 24 | 25 | 30;
  visualStyle: VisualStyle;
  /** Storage key of a representative image, for project lists. */
  thumbnailKey: string | null;
  lastActivity: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<ProjectDoc>(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    topic: { type: String, default: "", maxlength: 20000 },
    language: { type: String, required: true, default: "bn" },
    aspectRatio: { type: String, enum: ASPECT_RATIOS, required: true },
    resolution: { type: String, enum: RESOLUTIONS, required: true },
    fps: { type: Number, enum: [24, 25, 30], required: true },
    visualStyle: { type: String, enum: VISUAL_STYLES, required: true },
    thumbnailKey: { type: String, default: null },
    lastActivity: { type: String, default: "" },
  },
  { timestamps: true, collection: "projects" },
);
ProjectSchema.index({ updatedAt: -1 });
export const ProjectModel = defineModel<ProjectDoc>("Project", ProjectSchema);

// ---------------------------------------------------------------------------
// Timeline (current editing state, one per project) + snapshots
// ---------------------------------------------------------------------------

export interface TimelineDoc {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  /** Increments on every save — used for optimistic concurrency. */
  revision: number;
  data: unknown;
  updatedBy: "user" | "assistant" | "system";
  createdAt: Date;
  updatedAt: Date;
}

const TimelineSchema = new Schema<TimelineDoc>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    revision: { type: Number, required: true, default: 1 },
    data: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: String, enum: ["user", "assistant", "system"], default: "user" },
  },
  { timestamps: true, collection: "timelines", minimize: false },
);
TimelineSchema.index({ projectId: 1 }, { unique: true });
export const TimelineModel = defineModel<TimelineDoc>("Timeline", TimelineSchema);

export interface TimelineSnapshotDoc {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  revision: number;
  reason: string;
  data: unknown;
  createdAt: Date;
}

const TimelineSnapshotSchema = new Schema<TimelineSnapshotDoc>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    revision: { type: Number, required: true },
    reason: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "timelinesnapshots", minimize: false },
);
TimelineSnapshotSchema.index({ projectId: 1, createdAt: -1 });
export const TimelineSnapshotModel = defineModel<TimelineSnapshotDoc>("TimelineSnapshot", TimelineSnapshotSchema);

// ---------------------------------------------------------------------------
// Script (story, scenes, narration, visual plan)
// ---------------------------------------------------------------------------

export interface ScriptDoc {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  revision: number;
  data: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const ScriptDocSchema = new Schema<ScriptDoc>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    revision: { type: Number, required: true, default: 1 },
    data: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, collection: "scripts", minimize: false },
);
ScriptDocSchema.index({ projectId: 1 }, { unique: true });
export const ScriptModel = defineModel<ScriptDoc>("Script", ScriptDocSchema);

// ---------------------------------------------------------------------------
// Media assets
// ---------------------------------------------------------------------------

export const MEDIA_KINDS = ["audio", "image", "video", "render"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
export const MEDIA_ORIGINS = ["uploaded", "generated", "rendered"] as const;
export type MediaOrigin = (typeof MEDIA_ORIGINS)[number];
export const MEDIA_STATUSES = ["processing", "ready", "failed"] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export interface MediaAssetDoc {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  kind: MediaKind;
  origin: MediaOrigin;
  /** narration | music | sfx | ambience | visual | subtitle-source … */
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
  /** JSON array of peak values (0–1) for audio waveforms. */
  waveformKey: string | null;
  /** Small preview image (images, video first frame). */
  thumbnailKey: string | null;
  /** Horizontal strip of video frames for timeline thumbnails. */
  filmstripKey: string | null;
  filmstripFrames: number;
  provider: string | null;
  prompt: string | null;
  generationSettings: Record<string, unknown>;
  sceneId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const MediaAssetSchema = new Schema<MediaAssetDoc>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    kind: { type: String, enum: MEDIA_KINDS, required: true },
    origin: { type: String, enum: MEDIA_ORIGINS, required: true },
    role: { type: String, default: null },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    storageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    status: { type: String, enum: MEDIA_STATUSES, default: "processing" },
    error: { type: String, default: null },
    durationSeconds: { type: Number, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    waveformKey: { type: String, default: null },
    thumbnailKey: { type: String, default: null },
    filmstripKey: { type: String, default: null },
    filmstripFrames: { type: Number, default: 0 },
    provider: { type: String, default: null },
    prompt: { type: String, default: null },
    generationSettings: { type: Schema.Types.Mixed, default: {} },
    sceneId: { type: String, default: null },
  },
  { timestamps: true, collection: "mediaassets", minimize: false },
);
MediaAssetSchema.index({ projectId: 1, kind: 1, createdAt: -1 });
MediaAssetSchema.index({ storageKey: 1 }, { unique: true });
MediaAssetSchema.index({ name: "text" });
export const MediaAssetModel = defineModel<MediaAssetDoc>("MediaAsset", MediaAssetSchema);

// ---------------------------------------------------------------------------
// AI assistant conversation
// ---------------------------------------------------------------------------

export interface ChatMessageDoc {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  role: "user" | "assistant";
  text: string;
  /** Actions the assistant performed in this turn (shown as chips). */
  actions: Array<{ tool: string; summary: string; ok: boolean }>;
  /** The assistant job that answered (for user messages) or produced it. */
  jobId: Types.ObjectId | null;
  createdAt: Date;
}

const ChatMessageSchema = new Schema<ChatMessageDoc>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    role: { type: String, enum: ["user", "assistant"], required: true },
    text: { type: String, default: "" },
    actions: {
      type: [new Schema<{ tool: string; summary: string; ok: boolean }>({ tool: String, summary: String, ok: Boolean }, { _id: false })],
      default: [],
    },
    jobId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "chatmessages" },
);
ChatMessageSchema.index({ projectId: 1, createdAt: 1 });
export const ChatMessageModel = defineModel<ChatMessageDoc>("ChatMessage", ChatMessageSchema);

// ---------------------------------------------------------------------------
// Provider settings (API keys encrypted at rest)
// ---------------------------------------------------------------------------

export interface ProviderSettingDoc {
  _id: Types.ObjectId;
  provider: string;
  /** AES-256-GCM encrypted secret, never returned to the browser. */
  encryptedKey: string | null;
  /** Non-secret options: model ids, base URLs, voice ids… */
  options: Record<string, unknown>;
  lastTest: { ok: boolean; message: string; at: Date } | null;
  createdAt: Date;
  updatedAt: Date;
}

const ProviderSettingSchema = new Schema<ProviderSettingDoc>(
  {
    provider: { type: String, required: true },
    encryptedKey: { type: String, default: null },
    options: { type: Schema.Types.Mixed, default: {} },
    lastTest: {
      type: new Schema<{ ok: boolean; message: string; at: Date }>({ ok: Boolean, message: String, at: Date }, { _id: false }),
      default: null,
    },
  },
  { timestamps: true, collection: "providersettings", minimize: false },
);
ProviderSettingSchema.index({ provider: 1 }, { unique: true });
export const ProviderSettingModel = defineModel<ProviderSettingDoc>("ProviderSetting", ProviderSettingSchema);

// ---------------------------------------------------------------------------
// Jobs (persistent queue for generation, processing and rendering)
// ---------------------------------------------------------------------------

export const JOB_STATUSES = ["pending", "running", "completed", "failed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobError {
  userMessage: string;
  detail: string;
  retryable: boolean;
}

export interface GenerationJobDoc {
  _id: Types.ObjectId;
  projectId: Types.ObjectId | null;
  type: string;
  /** Short plain-language description shown in the UI. */
  title: string;
  input: Record<string, unknown>;
  status: JobStatus;
  progress: number;
  progressMessage: string;
  result: Record<string, unknown> | null;
  error: JobError | null;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  lockedBy: string | null;
  heartbeatAt: Date | null;
  cancelRequested: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GenerationJobSchema = new Schema<GenerationJobDoc>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    type: { type: String, required: true },
    title: { type: String, default: "" },
    input: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: JOB_STATUSES, required: true, default: "pending" },
    progress: { type: Number, default: 0, min: 0, max: 1 },
    progressMessage: { type: String, default: "" },
    result: { type: Schema.Types.Mixed, default: null },
    error: {
      type: new Schema<JobError>({ userMessage: String, detail: String, retryable: Boolean }, { _id: false }),
      default: null,
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 2, min: 1 },
    runAfter: { type: Date, default: () => new Date() },
    lockedBy: { type: String, default: null },
    heartbeatAt: { type: Date, default: null },
    cancelRequested: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "generationjobs", minimize: false },
);
GenerationJobSchema.index({ status: 1, runAfter: 1, createdAt: 1 });
GenerationJobSchema.index({ projectId: 1, createdAt: -1 });
GenerationJobSchema.index({ status: 1, heartbeatAt: 1 });
export const GenerationJobModel = defineModel<GenerationJobDoc>("GenerationJob", GenerationJobSchema);
