import { GenerateRequestSchema, runDirector, type DirectorEvent } from "@/lib/ai/director";

// Generation with research can take a couple of minutes.
export const maxDuration = 300;

/**
 * POST /api/generate — streams Server-Sent Events while Claude directs the video.
 * Body: GenerateRequest (prompt + options, or mode "edit" with the current spec).
 */
export async function POST(req: Request) {
  const parsed = GenerateRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: DirectorEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // client went away
        }
      };
      try {
        await runDirector(parsed.data, send, req.signal);
      } catch (err) {
        if (!req.signal.aborted) {
          console.error("[generate]", err);
          send({ type: "error", code: "failed", message: "Something went wrong while generating. Please try again." });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
