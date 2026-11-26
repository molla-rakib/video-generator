import { createMediaAsset, getProject, getTimeline, listMediaAssets, snapshotTimeline, touchProject, updateMediaAsset, type JobInput } from "@studio/database";
import { getStorage, probeMedia, projectKey, safeFileName } from "@studio/media";
import type { DocumentaryProps, MediaRef } from "@studio/renderer";
import { renderDocumentary } from "@studio/renderer/render";
import { checkRenderReadiness } from "@studio/timeline";
import type { JobContext } from "../context";
import { userError } from "../context";
import { processAsset } from "./media";

/** Rendering Engine: Remotion composes the approved timeline into a video file. */
export async function runRender(
  ctx: JobContext,
  input: JobInput<"render">,
  urlFor: (storageKey: string) => string,
): Promise<Record<string, unknown>> {
  const [project, { timeline }] = await Promise.all([getProject(ctx.projectId), getTimeline(ctx.projectId)]);
  const ids = [...new Set(timeline.clips.map((c) => c.assetId).filter((x): x is string => Boolean(x)))];
  const assets = (await listMediaAssets({ projectId: ctx.projectId, ids })).filter((a) => a.status === "ready");
  const issues = checkRenderReadiness(timeline, new Set(assets.map((a) => a.id)));
  const blocking = issues.filter((i) => i.severity === "error");
  if (blocking.length) throw userError(blocking.map((i) => i.message).join(" "));

  const media: Record<string, MediaRef> = {};
  for (const a of assets) {
    if (a.kind === "audio" || a.kind === "image" || a.kind === "video") media[a.id] = { url: urlFor(a.storageKey), kind: a.kind };
  }
  const fps = input.fps ?? timeline.fps;
  const props: DocumentaryProps = { timeline, media, fps };
  const shortSide = Math.min(timeline.width, timeline.height);
  const scale = (input.resolution === "720p" ? 720 : 1080) / shortSide;

  await snapshotTimeline(ctx.projectId, "Before render");
  const storage = getStorage();
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const key = projectKey(ctx.projectId, "renders", `${safeFileName(project.title, "documentary").replace(/\.[^.]+$/, "")}-${input.resolution}-${stamp}.${input.format}`);
  const output = await storage.localPath(key);
  await (await import("node:fs/promises")).mkdir((await import("node:path")).dirname(output), { recursive: true });

  let cancelled = false;
  let lastReport = 0;
  await renderDocumentary({
    props,
    outputPath: output,
    format: input.format,
    scale,
    onProgress: (p, stage) => {
      const now = Date.now();
      if (now - lastReport < 1500 && p < 1) return;
      lastReport = now;
      ctx.progress(0.02 + p * 0.95, stage).catch(() => {
        cancelled = true;
      });
    },
    shouldCancel: () => cancelled,
  });
  await ctx.checkCancelled();

  const info = await probeMedia(output);
  const stats = await storage.stat(key);
  const asset = await createMediaAsset({
    projectId: ctx.projectId,
    kind: "render",
    origin: "rendered",
    role: "render",
    name: `${project.title} — ${input.resolution} ${input.format.toUpperCase()}`,
    storageKey: key,
    mimeType: input.format === "webm" ? "video/webm" : "video/mp4",
    sizeBytes: stats?.sizeBytes ?? 0,
    durationSeconds: info.durationSeconds,
    width: info.width,
    height: info.height,
    provider: "remotion",
    generationSettings: { ...input, fps },
  });
  await processAsset(asset.id).catch(() => updateMediaAsset(asset.id, { status: "ready" }));
  await touchProject(ctx.projectId, "Documentary rendered");
  return { assetId: asset.id, durationSeconds: info.durationSeconds, warnings: issues.filter((i) => i.severity === "warning").map((i) => i.message) };
}
