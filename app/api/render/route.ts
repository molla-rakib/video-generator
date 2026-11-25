import { randomUUID } from "node:crypto";
import { z } from "zod";
import { renderVideo, RESOLUTION_SCALE } from "@/lib/render/server";
import { DocSpecSchema, RATIOS } from "@/lib/spec/schema";

export const maxDuration = 800;

const BodySchema = z.object({
  spec: DocSpecSchema,
  ratio: z.enum(RATIOS),
  resolution: z.enum(Object.keys(RESOLUTION_SCALE) as [keyof typeof RESOLUTION_SCALE]),
  title: z.string().max(80).optional(),
});

type RenderEvent =
  | { type: "progress"; stage: "bundling" | "rendering"; progress: number }
  | { type: "done"; url: string }
  | { type: "error"; message: string };

/** POST /api/render — renders an MP4 and streams progress as Server-Sent Events. */
export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { spec, ratio, resolution } = parsed.data;
  const id = `${ratio.replace(":", "x")}-${resolution}-${randomUUID().slice(0, 8)}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: RenderEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          // client went away
        }
      };
      let last = -1;
      try {
        await renderVideo({
          id,
          spec,
          ratio,
          resolution,
          signal: req.signal,
          onProgress: ({ stage, progress }) => {
            const pct = Math.floor(progress * 100);
            if (pct !== last || stage === "bundling") {
              last = pct;
              send({ type: "progress", stage, progress });
            }
          },
        });
        send({ type: "done", url: `/api/renders/${id}` });
      } catch (err) {
        if (!req.signal.aborted) {
          console.error("[render]", err);
          send({ type: "error", message: "Rendering failed. Check the server log." });
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
}
