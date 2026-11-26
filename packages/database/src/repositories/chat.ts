import type { Types } from "mongoose";
import { connectDatabase } from "../connection";
import { toObjectId } from "../ids";
import { ChatMessageModel, type ChatMessageDoc } from "../models";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions: Array<{ tool: string; summary: string; ok: boolean }>;
  jobId: string | null;
  createdAt: string;
}

function toMessage(d: ChatMessageDoc): ChatMessage {
  return {
    id: String(d._id),
    role: d.role,
    text: d.text,
    actions: d.actions ?? [],
    jobId: d.jobId ? String(d.jobId) : null,
    createdAt: d.createdAt.toISOString(),
  };
}

export async function listChatMessages(projectId: string, limit = 200): Promise<ChatMessage[]> {
  await connectDatabase();
  const docs = await ChatMessageModel.find({ projectId: toObjectId(projectId, "project") })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .lean<ChatMessageDoc[]>();
  return docs.reverse().map(toMessage);
}

export async function addChatMessage(input: {
  projectId: string;
  role: "user" | "assistant";
  text: string;
  actions?: ChatMessage["actions"];
  jobId?: string | Types.ObjectId | null;
}): Promise<ChatMessage> {
  await connectDatabase();
  const doc = await ChatMessageModel.create({
    projectId: toObjectId(input.projectId, "project"),
    role: input.role,
    text: input.text,
    actions: input.actions ?? [],
    jobId: input.jobId ?? null,
  });
  return toMessage(doc.toObject());
}

export async function clearChat(projectId: string): Promise<void> {
  await connectDatabase();
  await ChatMessageModel.deleteMany({ projectId: toObjectId(projectId, "project") });
}

export async function chatFingerprint(projectId: string): Promise<string> {
  await connectDatabase();
  const pid = toObjectId(projectId, "project");
  const [count, last] = await Promise.all([
    ChatMessageModel.countDocuments({ projectId: pid }),
    ChatMessageModel.findOne({ projectId: pid }, { _id: 1 }).sort({ _id: -1 }).lean(),
  ]);
  return `${count}:${last?._id ?? ""}`;
}
