import { Readable } from "node:stream";
import { getStorage } from "@studio/media";
import { NotFoundError } from "@studio/shared";

const MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  json: "application/json",
  srt: "text/plain; charset=utf-8",
  vtt: "text/vtt; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
};

export function mimeFor(fileName: string): string {
  return MIME[fileName.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/**
 * Stream a stored file as an HTTP response, honouring Range requests so
 * audio and video can seek in the browser.
 */
export async function serveStoredFile(
  key: string,
  request: Request,
  options: { type?: string; cacheControl?: string; downloadName?: string } = {},
): Promise<Response> {
  const storage = getStorage();
  const info = await storage.stat(key);
  if (!info) throw new NotFoundError("file");
  const headers: Record<string, string> = {
    "Content-Type": options.type ?? mimeFor(key),
    "Accept-Ranges": "bytes",
    "Cache-Control": options.cacheControl ?? "private, max-age=3600",
  };
  if (options.downloadName) headers["Content-Disposition"] = `attachment; filename="${options.downloadName.replace(/"/g, "")}"`;

  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range") ?? "");
  if (range) {
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
}
