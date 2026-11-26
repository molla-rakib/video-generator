import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { createMediaAsset, enqueue, getProject, listMediaAssets, type MediaKind } from "@studio/database";
import { getStorage, projectKey, safeFileName } from "@studio/media";
import { UserFacingError } from "@studio/shared";
import { apiHandler } from "@/lib/server/api";

type Context = RouteContext<"/api/projects/[projectId]/media">;

export const GET = apiHandler(async (_request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  return Response.json({ media: await listMediaAssets({ projectId }) });
});

const KIND_BY_MIME: Array<[RegExp, MediaKind]> = [
  [/^audio\//, "audio"],
  [/^image\/(png|jpe?g|webp|gif)$/, "image"],
  [/^video\//, "video"],
];
const EXT_KIND: Record<string, MediaKind> = {
  mp3: "audio", wav: "audio", m4a: "audio", aac: "audio", ogg: "audio", flac: "audio", opus: "audio",
  png: "image", jpg: "image", jpeg: "image", webp: "image", gif: "image",
  mp4: "video", mov: "video", webm: "video", mkv: "video", m4v: "video",
};
const MAX_BYTES = 4 * 1024 ** 3;

/**
 * Upload one file. The body is the raw file (streamed straight to storage,
 * never buffered in memory); metadata comes in the query string.
 */
export const POST = apiHandler(async (request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  await getProject(projectId);
  const params = request.nextUrl.searchParams;
  const originalName = params.get("name")?.slice(0, 200) || "upload";
  const mime = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "";
  const kind = KIND_BY_MIME.find(([re]) => re.test(mime))?.[1] ?? EXT_KIND[ext];
  if (!kind) throw new UserFacingError("This kind of file isn't supported. Upload audio (MP3, WAV, M4A), pictures (PNG, JPG, WebP) or video (MP4, MOV, WebM).");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new UserFacingError("This file is larger than 4 GB.");
  if (!request.body) throw new UserFacingError("The upload was empty.");

  const fileName = `${Date.now()}-${safeFileName(originalName, kind)}`;
  const key = projectKey(projectId, kind === "audio" ? "audio" : kind === "image" ? "images" : "video", fileName);
  const { sizeBytes } = await getStorage().put(key, Readable.fromWeb(request.body as import("node:stream/web").ReadableStream<Uint8Array>));
  if (sizeBytes === 0) {
    await getStorage().delete(key);
    throw new UserFacingError("The upload was empty.");
  }
  const role = params.get("role") || (kind === "image" || kind === "video" ? "visual" : null);
  const asset = await createMediaAsset({
    projectId,
    kind,
    origin: "uploaded",
    role,
    name: originalName.replace(/\.[^.]+$/, ""),
    storageKey: key,
    mimeType: mime || "application/octet-stream",
    sizeBytes,
    sceneId: params.get("sceneId") || null,
  });
  const job = await enqueue("media.process", projectId, { assetId: asset.id, shotId: params.get("shotId") || null }, `Preparing “${asset.name}”`);
  return Response.json({ asset, job }, { status: 201 });
});
