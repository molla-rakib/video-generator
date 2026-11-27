import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  createMediaAsset,
  existingProjectFiles,
  getProject,
  getTimeline,
  projectFile,
  snapshotTimeline,
  touchProject,
  updateMediaAsset,
  type JobInput,
} from "@studio/database";
import { getStorage, normalizeLoudness, probeMedia, safeFileName } from "@studio/media";
import type { VideoProps } from "@studio/renderer";
import { renderVideo } from "@studio/renderer/render";
import { dimensionsFor, type AspectRatio } from "@studio/shared";
import { checkRenderReadiness, referencedFiles } from "@studio/timeline";
import type { JobContext } from "../context";
import { userError } from "../context";
import { processAsset } from "./media";

export interface RenderServer {
  /** URL prefix for a project's files, e.g. http://127.0.0.1:port/projects/<id>/ */
  fileBase(projectId: string): string;
  /** URL prefix for a project's compiled scenes. */
  sceneBase(projectId: string): string;
}

const RATIO_SLUG: Record<AspectRatio, string> = { "16:9": "16x9", "9:16": "9x16", "4:5": "4x5", "1:1": "1x1" };

/**
 * Export: render the timeline once per aspect ratio at the chosen
 * resolution, then normalise loudness (−14 LUFS / −1 dBTP by default).
 * Each finished file is saved in the project's exports/ folder.
 */
export async function runRender(ctx: JobContext, input: JobInput<"render">, server: RenderServer): Promise<Record<string, unknown>> {
  const [project, { timeline }] = await Promise.all([getProject(ctx.projectId), getTimeline(ctx.projectId)]);
  const files = await existingProjectFiles(ctx.projectId, referencedFiles(timeline));
  const issues = checkRenderReadiness(timeline, files);
  const blocking = issues.filter((i) => i.severity === "error");
  if (blocking.length) throw userError(blocking.map((i) => i.message).join(" "));

  // Cache-bust per file so the renderer never uses a stale copy.
  const storage = getStorage();
  const versions: Record<string, string> = {};
  for (const p of files) {
    const info = await storage.stat(projectFile(ctx.projectId, p));
    if (info) versions[p] = String(info.modifiedAt.getTime());
  }

  await snapshotTimeline(ctx.projectId, "Before export");
  const fps = input.fps ?? timeline.fps;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const baseName = safeFileName(project.title, "video").replace(/\.[^.]+$/, "");
  const outputs: Array<{ ratio: AspectRatio; assetId: string; width: number | null; height: number | null }> = [];
  const shares = input.ratios.length;

  for (const [index, ratio] of input.ratios.entries()) {
    const label = input.ratios.length > 1 ? `${ratio} (${index + 1} of ${shares}): ` : "";
    const props: VideoProps = {
      timeline,
      ratio,
      fileBase: server.fileBase(ctx.projectId),
      sceneBase: server.sceneBase(ctx.projectId),
      versions,
      fps,
    };
    const target = dimensionsFor(ratio, input.resolution);
    const scale = target.height / dimensionsFor(ratio, "1080p").height;
    const key = projectFile(ctx.projectId, `exports/${baseName}-${RATIO_SLUG[ratio]}-${input.resolution}-${stamp}.${input.format}`);
    const finalPath = await storage.localPath(key);
    await mkdir(path.dirname(finalPath), { recursive: true });
    const rawPath = finalPath.replace(/(\.[a-z0-9]+)$/, ".raw$1");

    let cancelled = false;
    let lastReport = 0;
    const report = (p: number, message: string) => {
      const now = Date.now();
      if (now - lastReport < 1500 && p < 1) return;
      lastReport = now;
      ctx.progress((index + p) / shares, label + message).catch(() => {
        cancelled = true;
      });
    };
    await renderVideo({
      props,
      outputPath: rawPath,
      format: input.format,
      scale,
      onProgress: (p, stage) => report(0.02 + p * 0.88, stage),
      shouldCancel: () => cancelled,
    });
    await ctx.checkCancelled();

    report(0.92, "Balancing the loudness");
    try {
      await normalizeLoudness(rawPath, finalPath, {
        targetLufs: timeline.mix.targetLufs,
        truePeak: -1,
        audioCodec: input.format === "webm" ? "libopus" : "aac",
      });
    } finally {
      await rm(rawPath, { force: true });
    }

    const info = await probeMedia(finalPath);
    const size = (await stat(finalPath)).size;
    const asset = await createMediaAsset({
      projectId: ctx.projectId,
      kind: "render",
      origin: "rendered",
      role: "render",
      name: `${project.title} — ${ratio} ${input.resolution}`,
      storageKey: key,
      mimeType: input.format === "webm" ? "video/webm" : "video/mp4",
      sizeBytes: size,
      durationSeconds: info.durationSeconds,
      width: info.width,
      height: info.height,
      provider: "remotion",
      generationSettings: { ...input, ratio, fps },
    });
    await processAsset(asset.id).catch(() => updateMediaAsset(asset.id, { status: "ready" }));
    outputs.push({ ratio, assetId: asset.id, width: info.width, height: info.height });
  }

  await touchProject(ctx.projectId, outputs.length > 1 ? `Exported ${outputs.length} videos` : "Video exported");
  return { outputs, warnings: issues.filter((i) => i.severity === "warning").map((i) => i.message) };
}
