import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getMediaAsset, getProject, getScript, getTimeline, listMediaAssets, touchProject, updateScript, updateTimeline, type JobInput } from "@studio/database";
import { concatAudio } from "@studio/media";
import { getSpeechEngine, splitForSpeech } from "@studio/providers";
import { layoutNarration, layoutSceneVisuals, type Script, type Timeline } from "@studio/timeline";
import type { JobContext } from "../context";
import { userError } from "../context";
import { storeGenerated } from "./media";

/**
 * Generate narration for scenes with the connected voice engine, then lay
 * all narration on the timeline in script order.
 */
export async function runVoiceGenerate(ctx: JobContext, input: JobInput<"voice.generate">): Promise<Record<string, unknown>> {
  const [project, { script }, { timeline }] = await Promise.all([getProject(ctx.projectId), getScript(ctx.projectId), getTimeline(ctx.projectId)]);
  if (timeline.audioLockedAt) throw userError("The audio is locked. Unlock it in the editor before generating new narration.");
  const targets = script.scenes.filter((s) => s.narration.trim() && (input.sceneIds.length === 0 || input.sceneIds.includes(s.id)));
  if (targets.length === 0) throw userError("There's no narration to voice yet. Write or generate the script first.");
  const engine = await getSpeechEngine();
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-voice-"));
  let done = 0;
  try {
    for (const scene of targets) {
      await ctx.progress(done / targets.length, `${engine.label}: voicing “${scene.title}” (${done + 1} of ${targets.length})`);
      const chunks = splitForSpeech(scene.narration, engine.maxChars);
      const parts: string[] = [];
      let extension: "mp3" | "wav" = "mp3";
      let mimeType = "audio/mpeg";
      for (const [i, chunk] of chunks.entries()) {
        await ctx.checkCancelled();
        const audio = await engine.speak({ text: chunk, language: project.language });
        const file = path.join(dir, `${scene.id}-${i}.${audio.extension}`);
        await writeFile(file, audio.audio);
        parts.push(file);
        extension = audio.extension;
        mimeType = audio.mimeType;
      }
      let data: Buffer;
      if (parts.length === 1) {
        data = await import("node:fs/promises").then((fs) => fs.readFile(parts[0]!));
      } else {
        const joined = path.join(dir, `${scene.id}-joined.mp3`);
        await concatAudio(parts, joined);
        data = await import("node:fs/promises").then((fs) => fs.readFile(joined));
        extension = "mp3";
        mimeType = "audio/mpeg";
      }
      const asset = await storeGenerated({
        projectId: ctx.projectId,
        kind: "audio",
        role: "narration",
        name: `Narration — ${scene.title}`,
        data,
        extension,
        mimeType,
        provider: engine.id,
        prompt: scene.narration,
        sceneId: scene.id,
        generationSettings: { engine: engine.id, language: project.language, chunks: chunks.length },
      });
      await updateScript(ctx.projectId, (s) => ({
        ...s,
        scenes: s.scenes.map((sc) => (sc.id === scene.id ? { ...sc, narrationAssetId: asset.id } : sc)),
      }));
      done++;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  await ctx.progress(0.95, "Placing narration on the timeline");
  await relayoutNarration(ctx.projectId);
  await touchProject(ctx.projectId, `Narration generated with ${engine.label}`);
  return { scenes: done };
}

/** Put every scene's narration on the timeline in order, then re-fit visuals. */
export async function relayoutNarration(projectId: string): Promise<Timeline> {
  const { script } = await getScript(projectId);
  const withVoice = script.scenes.filter((s) => s.narrationAssetId);
  const assets = new Map((await listMediaAssets({ projectId, ids: withVoice.map((s) => s.narrationAssetId!) })).map((a) => [a.id, a]));
  const items = withVoice
    .map((s) => ({ scene: s, asset: assets.get(s.narrationAssetId!) }))
    .filter((x) => x.asset?.status === "ready" && x.asset.durationSeconds)
    .map((x) => ({ sceneId: x.scene.id, assetId: x.asset!.id, duration: x.asset!.durationSeconds!, label: x.scene.title }));
  const stored = await updateTimeline(projectId, (t) => layoutNarration(t, items), "system");
  return refitVisuals(projectId, script, stored.timeline);
}

/** Re-place each scene's planned pictures to fill its narration. */
export async function refitVisuals(projectId: string, script: Script, _timeline?: Timeline): Promise<Timeline> {
  const ids = script.scenes.flatMap((s) => s.shots.map((sh) => sh.assetId).filter((x): x is string => Boolean(x)));
  if (ids.length === 0) return (await getTimeline(projectId)).timeline;
  const assets = await listMediaAssets({ projectId, ids });
  const map = new Map(
    assets
      .filter((a) => a.status === "ready" && (a.kind === "image" || a.kind === "video"))
      .map((a) => [a.id, { kind: a.kind as "image" | "video", duration: a.durationSeconds }]),
  );
  const stored = await updateTimeline(
    projectId,
    (t) => script.scenes.reduce((acc, scene) => layoutSceneVisuals(acc, scene, map), t),
    "system",
  );
  return stored.timeline;
}

export async function narrationAssetDuration(assetId: string): Promise<number | null> {
  return (await getMediaAsset(assetId)).durationSeconds;
}
