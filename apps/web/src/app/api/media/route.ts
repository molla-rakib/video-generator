import type { NextRequest } from "next/server";
import { listMediaAssets, listProjects, type MediaKind } from "@studio/database";
import { apiHandler } from "@/lib/server/api";

/** Media across all projects, for the Media Library. */
export const GET = apiHandler(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const kind = params.get("kind") as MediaKind | null;
  const [media, projects] = await Promise.all([
    listMediaAssets({
      kind: kind && ["audio", "image", "video", "render"].includes(kind) ? kind : undefined,
      search: params.get("search") ?? undefined,
      projectId: params.get("projectId") ?? undefined,
    }),
    listProjects(),
  ]);
  const titles = Object.fromEntries(projects.map((p) => [p.id, p.title]));
  return Response.json({ media: media.map((m) => ({ ...m, projectTitle: titles[m.projectId] ?? "" })) });
});
