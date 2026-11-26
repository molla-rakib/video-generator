import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { mediaRoot, normaliseKey } from "@studio/media";

const MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * A tiny loopback-only file server for the renderer. Remotion's headless
 * browser loads media over HTTP, so during renders it reads project files
 * from here (with Range support for seeking in video and audio).
 */
export async function startMediaServer(): Promise<{ urlFor: (storageKey: string) => string; close: () => void }> {
  const root = mediaRoot();
  const server = http.createServer(async (req, res) => {
    try {
      const key = normaliseKey(decodeURIComponent((req.url ?? "/").split("?")[0]!.replace(/^\/+/, "")));
      const file = path.join(root, ...key.split("/"));
      const info = await stat(file);
      const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", type);
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
        res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${info.size}`, "Content-Length": end - start + 1 });
        createReadStream(file, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { "Content-Length": info.size });
        createReadStream(file).pipe(res);
      }
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    urlFor: (storageKey) => `http://127.0.0.1:${port}/${storageKey.split("/").map(encodeURIComponent).join("/")}`,
    close: () => server.close(),
  };
}
