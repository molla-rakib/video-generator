import type { NextRequest } from "next/server";
import { projectFile } from "@studio/database";
import { NotFoundError } from "@studio/shared";
import { apiHandler } from "@/lib/server/api";
import { serveStoredFile } from "@/lib/server/files";

type Context = RouteContext<"/api/projects/[projectId]/files/[...path]">;

/**
 * Serve any file inside a project folder by its project-relative path —
 * the same `src` paths project.json uses ("media/face.mp4",
 * "audio/sfx/rain.mp3"). Versioned URLs (?v=…) can be cached for long.
 */
export const GET = apiHandler(async (request: NextRequest, ctx: Context) => {
  const { projectId, path } = await ctx.params;
  let key: string;
  try {
    key = projectFile(projectId, path.join("/"));
  } catch {
    throw new NotFoundError("file");
  }
  const versioned = request.nextUrl.searchParams.has("v");
  return serveStoredFile(key, request, {
    cacheControl: versioned ? "private, max-age=31536000, immutable" : "private, no-cache",
    downloadName: request.nextUrl.searchParams.has("download") ? path.at(-1) : undefined,
  });
});
