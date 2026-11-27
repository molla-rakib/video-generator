import type { NextRequest } from "next/server";
import { z } from "zod";
import { deleteMediaAsset, getMediaAsset, getTimeline, updateMediaAsset } from "@studio/database";
import { getStorage } from "@studio/media";
import { UserFacingError } from "@studio/shared";
import { apiHandler, readJson } from "@/lib/server/api";

type Context = RouteContext<"/api/media/[assetId]">;

export const GET = apiHandler(async (_request: NextRequest, ctx: Context) => {
  const { assetId } = await ctx.params;
  const asset = await getMediaAsset(assetId);
  const { timeline } = await getTimeline(asset.projectId);
  const usedBy = timeline.clips.filter((c) => c.src === asset.path).map((c) => ({ clipId: c.id, start: c.start }));
  return Response.json({ asset, usedBy });
});

export const PATCH = apiHandler(async (request: NextRequest, ctx: Context) => {
  const { assetId } = await ctx.params;
  const body = z.object({ name: z.string().trim().min(1).max(200) }).parse(await readJson(request));
  return Response.json({ asset: await updateMediaAsset(assetId, { name: body.name }) });
});

/** Delete a file. Refuses while the timeline still uses it, so nothing breaks silently. */
export const DELETE = apiHandler(async (_request: NextRequest, ctx: Context) => {
  const { assetId } = await ctx.params;
  const asset = await getMediaAsset(assetId);
  if (asset.kind !== "render") {
    const { timeline } = await getTimeline(asset.projectId);
    const uses = timeline.clips.filter((c) => c.src === asset.path).length;
    if (uses > 0) throw new UserFacingError(`This file is used ${uses} time${uses === 1 ? "" : "s"} on the timeline. Remove those clips first.`, "in_use", 409);
  }
  await deleteMediaAsset(assetId);
  const storage = getStorage();
  for (const key of [asset.storageKey, asset.waveformKey, asset.thumbnailKey, asset.filmstripKey]) {
    if (key) await storage.delete(key).catch(() => {});
  }
  return new Response(null, { status: 204 });
});
