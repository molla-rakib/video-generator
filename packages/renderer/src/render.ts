import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { makeCancelSignal, renderMedia, selectComposition } from "@remotion/renderer";
import type { DocumentaryProps } from "./composition";

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
  props: DocumentaryProps;
  outputPath: string;
  format: "mp4" | "webm";
  /** Output height relative to the timeline (e.g. 720/1080). */
  scale: number;
  onProgress?: (progress: number, stage: string) => void;
  /** Return true to abort the render. */
  shouldCancel?: () => boolean;
  concurrency?: number;
}

export async function renderDocumentary(options: RenderOptions): Promise<void> {
  options.onProgress?.(0, "Preparing the renderer");
  const serveUrl = await getBundle();
  const composition = await selectComposition({ serveUrl, id: "Documentary", inputProps: options.props });
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
      outputLocation: options.outputPath,
      scale: options.scale,
      concurrency: options.concurrency ?? 2,
      cancelSignal: signal,
      onProgress: ({ progress, stitchStage }) => {
        options.onProgress?.(progress, stitchStage === "muxing" ? "Finishing the file" : "Rendering frames");
      },
    });
  } finally {
    clearInterval(watcher);
  }
}
