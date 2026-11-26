import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { getMediaAsset } from "@studio/database";
import { getStorage, safeFileName } from "@studio/media";
import { NotFoundError } from "@studio/shared";
import { apiHandler } from "@/lib/server/api";

type Context = RouteContext<"/api/media/[assetId]/[variant]">;

/**
 * Serve a media file or one of its derived files:
 *   file | thumb | waveform | strip | download
 * Supports HTTP Range requests so audio/video can seek in the browser.
 */
export const GET = apiHandler(async (request: NextRequest, ctx: Context) => {
  const { assetId, variant } = await ctx.params;
  const asset = await getMediaAsset(assetId);
  const key =
    variant === "file" || variant === "download"
      ? asset.storageKey
      : variant === "thumb"
        ? asset.thumbnailKey
        : variant === "waveform"
          ? asset.waveformKey
          : variant === "strip"
            ? asset.filmstripKey
            : null;
  if (!key) throw new NotFoundError("file");
  const storage = getStorage();
  const info = await storage.stat(key);
  if (!info) throw new NotFoundError("file");

  const type =
    variant === "thumb" || variant === "strip" ? "image/jpeg" : variant === "waveform" ? "application/json" : asset.mimeType;
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": variant === "file" ? "private, max-age=3600" : "private, max-age=86400",
  };
  if (variant === "download") {
    const ext = asset.storageKey.split(".").pop();
    headers["Content-Disposition"] = `attachment; filename="${safeFileName(`${asset.name}.${ext}`)}"`;
  }

  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range") ?? "");
  if (range && variant !== "waveform") {
    const start = range[1] ? Number(range[1]) : Math.max(0, info.sizeBytes - Number(range[2] || 0));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), info.sizeBytes - 1) : info.sizeBytes - 1;
    if (start >= info.sizeBytes || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${info.sizeBytes}` } });
    }
    const stream = Readable.toWeb(storage.read(key, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${info.sizeBytes}`, "Content-Length": String(end - start + 1) },
    });
  }
  const stream = Readable.toWeb(storage.read(key)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "Content-Length": String(info.sizeBytes) } });
});
