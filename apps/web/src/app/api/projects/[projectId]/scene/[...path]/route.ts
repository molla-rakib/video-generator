import type { NextRequest } from "next/server";
import { projectFile } from "@studio/database";
import { getStorage } from "@studio/media";
import { compileScene, SceneCompileError } from "@studio/renderer/scene-compiler";
import { UserFacingError } from "@studio/shared";
import { apiHandler } from "@/lib/server/api";

type Context = RouteContext<"/api/projects/[projectId]/scene/[...path]">;

/**
 * A scene component, compiled for the preview player. Scene files are
 * written by the AI agent (or by hand) as .tsx inside the project folder.
 */
export const GET = apiHandler(async (_request: NextRequest, ctx: Context) => {
  const { projectId, path } = await ctx.params;
  const projectJson = await getStorage().localPath(projectFile(projectId, "project.json"));
  try {
    const code = await compileScene(projectJson.slice(0, -"project.json".length), path.join("/"));
    return new Response(code, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "private, no-cache" } });
  } catch (error) {
    if (error instanceof SceneCompileError) throw new UserFacingError(error.message, "scene_compile_error", 422);
    throw error;
  }
});
