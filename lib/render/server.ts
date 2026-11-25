/**
 * Local MP4 export with Remotion's renderer (server-only).
 * The Remotion project is bundled once per server process and reused.
 * Production plan: swap this for Remotion Lambda (same compositions, same props).
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { DocSpec, Ratio } from "../spec/schema";

export const RESOLUTION_SCALE = { "720p": 720 / 1080, "1080p": 1, "1440p": 1440 / 1080, "4k": 2 } as const;
export type ExportResolution = keyof typeof RESOLUTION_SCALE;

export const RENDER_DIR = path.join(process.cwd(), "out", "renders");

let bundled: Promise<string> | null = null;
function getBundle() {
  bundled ??= bundle({ entryPoint: path.join(process.cwd(), "remotion", "index.ts") }).catch((err) => {
    bundled = null;
    throw err;
  });
  return bundled;
}

export async function renderVideo(opts: {
  id: string;
  spec: DocSpec;
  ratio: Ratio;
  resolution: ExportResolution;
  onProgress: (p: { stage: "bundling" | "rendering"; progress: number }) => void;
  signal?: AbortSignal;
}): Promise<string> {
  opts.onProgress({ stage: "bundling", progress: 0 });
  const serveUrl = await getBundle();
  const inputProps = { spec: opts.spec, ratio: opts.ratio };
  const composition = await selectComposition({ serveUrl, id: `Doc-${opts.ratio.replace(":", "x")}`, inputProps });

  await mkdir(RENDER_DIR, { recursive: true });
  const outputLocation = path.join(RENDER_DIR, `${opts.id}.mp4`);
  let cancel: (() => void) | undefined;
  opts.signal?.addEventListener("abort", () => cancel?.());

  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: "h264",
    outputLocation,
    scale: RESOLUTION_SCALE[opts.resolution],
    onProgress: ({ progress }) => opts.onProgress({ stage: "rendering", progress }),
    cancelSignal: (fn) => {
      cancel = fn;
    },
  });
  return outputLocation;
}
