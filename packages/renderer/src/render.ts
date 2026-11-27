import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { makeCancelSignal, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import type { VideoProps } from "./composition";

/**
 * Server-side rendering with Remotion. The bundle is built once per process
 * and reused for every render.
 */

let bundlePromise: Promise<string> | null = null;

function getBundle(): Promise<string> {
  bundlePromise ??= bundle({
    entryPoint: path.join(path.dirname(fileURLToPath(import.meta.url)), "remotion-entry.tsx"),
  }).catch((error: unknown) => {
    bundlePromise = null;
    throw error;
  });
  return bundlePromise;
}

export interface RenderOptions {
  props: VideoProps;
  outputPath: string;
  format: "mp4" | "webm";
  /** Output size relative to the 1080p composition (e.g. 2 for 2160p). */
  scale: number;
  onProgress?: (progress: number, stage: string) => void;
  /** Return true to abort the render. */
  shouldCancel?: () => boolean;
  concurrency?: number;
}

/**
 * Render single frames as PNG — used so the agent can look at its own work.
 * Returns the frames that rendered (a broken scene is reported, not fatal).
 */
export async function renderStills(options: {
  props: VideoProps;
  stills: Array<{ frame: number; outputPath: string }>;
  scale?: number;
  onStill?: (done: number, total: number) => void;
}): Promise<Array<{ frame: number; outputPath: string; error?: string }>> {
  const serveUrl = await getBundle();
  const composition = await selectComposition({ serveUrl, id: "Video", inputProps: options.props });
  const results: Array<{ frame: number; outputPath: string; error?: string }> = [];
  for (const [i, still] of options.stills.entries()) {
    try {
      await renderStill({
        serveUrl,
        composition,
        inputProps: options.props,
        frame: Math.min(composition.durationInFrames - 1, Math.max(0, still.frame)),
        output: still.outputPath,
        imageFormat: "png",
        scale: options.scale ?? 0.5,
        chromiumOptions: { disableWebSecurity: true },
      });
      results.push(still);
    } catch (error) {
      results.push({ ...still, error: error instanceof Error ? error.message.split("\n")[0] : String(error) });
    }
    options.onStill?.(i + 1, options.stills.length);
  }
  return results;
}

export async function renderVideo(options: RenderOptions): Promise<void> {
  options.onProgress?.(0, "Preparing the renderer");
  const serveUrl = await getBundle();
  const composition = await selectComposition({ serveUrl, id: "Video", inputProps: options.props });
  const { cancelSignal: signal, cancel } = makeCancelSignal();
  const watcher = setInterval(() => {
    if (options.shouldCancel?.()) cancel();
  }, 1000);
  try {
    await renderMedia({
      serveUrl,
      composition,
      inputProps: options.props,
      codec: options.format === "webm" ? "vp8" : "h264",
      audioCodec: options.format === "webm" ? "opus" : "aac",
      outputLocation: options.outputPath,
      scale: options.scale,
      concurrency: options.concurrency ?? 2,
      cancelSignal: signal,
      // Scenes are evaluated from the worker's loopback server.
      chromiumOptions: { disableWebSecurity: true },
      onProgress: ({ progress, stitchStage }) => {
        options.onProgress?.(progress, stitchStage === "muxing" ? "Finishing the file" : "Rendering frames");
      },
    });
  } finally {
    clearInterval(watcher);
  }
}
