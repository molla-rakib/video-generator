import type { NextRequest } from "next/server";
import { z } from "zod";
import { addChatMessage, clearChat, enqueue, getProject, listChatMessages, listRecentJobs } from "@studio/database";
import { UserFacingError } from "@studio/shared";
import { apiHandler, readJson } from "@/lib/server/api";

type Context = RouteContext<"/api/projects/[projectId]/chat">;

export const GET = apiHandler(async (_request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  return Response.json({ messages: await listChatMessages(projectId) });
});

/** Send a message: it is stored, then the assistant answers in a background job. */
export const POST = apiHandler(async (request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  await getProject(projectId);
  const { text } = z.object({ text: z.string().trim().min(1).max(8000) }).parse(await readJson(request));
  const busy = (await listRecentJobs(projectId)).some((j) => j.type === "assistant.turn" && (j.status === "pending" || j.status === "running"));
  if (busy) throw new UserFacingError("The assistant is still working on your last request. Please wait a moment.", "assistant_busy", 409);
  const message = await addChatMessage({ projectId, role: "user", text });
  const job = await enqueue("assistant.turn", projectId, { messageId: message.id, text });
  return Response.json({ message, job }, { status: 201 });
});

export const DELETE = apiHandler(async (_request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  await clearChat(projectId);
  return new Response(null, { status: 204 });
});
