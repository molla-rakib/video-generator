import type { NextRequest } from "next/server";
import { getTimeline, listRecentJobs, mediaFingerprint, projectFile } from "@studio/database";
import { getStorage } from "@studio/media";
import { referencedFiles } from "@studio/timeline";
import { apiHandler } from "@/lib/server/api";

type Context = RouteContext<"/api/projects/[projectId]/status">;

/**
 * Cheap change detection for the editor's polling loop: the project file's
 * fingerprint, the media list, background jobs, and the version (mtime) of
 * every file the timeline uses — so the preview reloads a scene that was
 * just rewritten, and flags files that are missing (null).
 */
export const GET = apiHandler(async (_request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  const [stored, media, jobs] = await Promise.all([getTimeline(projectId), mediaFingerprint(projectId), listRecentJobs(projectId)]);
  const storage = getStorage();
  const files: Record<string, string | null> = {};
  await Promise.all(
    referencedFiles(stored.timeline).map(async (p) => {
      try {
        const info = await storage.stat(projectFile(projectId, p));
        files[p] = info ? String(info.modifiedAt.getTime()) : null;
      } catch {
        files[p] = null;
      }
    }),
  );
  return Response.json({ fingerprint: stored.fingerprint, media, jobs, files });
});
