import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { RENDER_DIR } from "@/lib/render/server";

/** GET /api/renders/:id — downloads a rendered MP4. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ids are generated server-side: "<ratio>-<resolution>-<hex>"; reject anything else.
  if (!/^[0-9x]+-[0-9a-z]+-[0-9a-f]{8}$/.test(id)) return new Response("Not found", { status: 404 });
  const file = path.join(RENDER_DIR, `${id}.mp4`);
  try {
    const info = await stat(file);
    const download = new URL(req.url).searchParams.get("download");
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(info.size),
        ...(download ? { "Content-Disposition": `attachment; filename="${download.replace(/[^a-zA-Z0-9 _-]/g, "")}.mp4"` } : {}),
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
