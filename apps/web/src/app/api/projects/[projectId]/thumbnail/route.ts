import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { getProject } from "@studio/database";
import { getStorage } from "@studio/media";
import { NotFoundError } from "@studio/shared";
import { apiHandler } from "@/lib/server/api";

type Context = RouteContext<"/api/projects/[projectId]/thumbnail">;

export const GET = apiHandler(async (_request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  const project = await getProject(projectId);
  if (!project.thumbnailKey) throw new NotFoundError("thumbnail");
  const storage = getStorage();
  if (!(await storage.stat(project.thumbnailKey))) throw new NotFoundError("thumbnail");
  return new Response(Readable.toWeb(storage.read(project.thumbnailKey)) as ReadableStream, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=60" },
  });
});
