import type { NextRequest } from "next/server";
import { z } from "zod";
import { restoreProjectBackup, touchProject } from "@studio/database";
import { apiHandler, readJson } from "@/lib/server/api";

type Context = RouteContext<"/api/projects/[projectId]/history/restore">;

/** Undo an AI change: put back project.json and the scenes from a backup. */
export const POST = apiHandler(async (request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  const { backup } = z.object({ backup: z.string().min(1).max(120) }).parse(await readJson(request));
  await restoreProjectBackup(projectId, backup);
  await touchProject(projectId, "Undid Claude's change");
  return Response.json({ ok: true });
});
