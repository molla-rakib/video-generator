import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { makeCancelSignal, renderMedia, selectComposition } from "@remotion/renderer";
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
