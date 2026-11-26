import { z } from "zod";
import { enqueue, getProject, getScript, getTimeline, touchProject, updateScript, type JobInput } from "@studio/database";
import { getBrain, getImageGenerator, ProviderNotConfiguredError } from "@studio/providers";
import { MOTIONS, newId, sceneRanges, TRANSITIONS, type ShotPlan } from "@studio/timeline";
import type { JobContext } from "../context";
import { userError } from "../context";
import { visualSystemPrompt } from "../prompts";
import { storeGenerated } from "./media";
import { refitVisuals } from "./voice";

const ShotsOutputSchema = z.object({
  shots: z.array(
    z.object({
      description: z.string(),
      imagePrompt: z.string(),
      durationSeconds: z.number(),
      motion: z.enum(MOTIONS),
      transition: z.enum(TRANSITIONS),
    }),
  ),
});

/** Visual Planning Agent: shot list per scene, timed to the real narration. */
export async function runStoryboard(ctx: JobContext, input: JobInput<"storyboard.plan">): Promise<Record<string, unknown>> {
  const [project, { script }, { timeline }] = await Promise.all([getProject(ctx.projectId), getScript(ctx.projectId), getTimeline(ctx.projectId)]);
  const ranges = sceneRanges(timeline);
  const targets = script.scenes.filter((s) => input.sceneIds.length === 0 || input.sceneIds.includes(s.id));
  if (targets.length === 0) throw userError("There are no scenes to plan yet. Write the script first.");
  const brain = await getBrain();
  let planned = 0;
  for (const [i, scene] of targets.entries()) {
    await ctx.progress(i / targets.length, `${brain.label}: planning shots for “${scene.title}”`);
    const range = ranges.get(scene.id);
    const duration = range ? range.end - range.start : scene.estimatedDuration;
    const out = await brain.generateJson({
      system: visualSystemPrompt(project.visualStyle, project.aspectRatio),
      schemaName: "shot_list",
      effort: "medium",
      schema: ShotsOutputSchema,
      prompt: [
        `Documentary: ${script.title || project.title}`,
        `Scene: ${scene.title}`,
        `Mood: ${scene.mood || "—"}`,
        `Visual direction: ${scene.visualDirection || "—"}`,
        `Narration (${project.language}): ${scene.narration}`,
        `Scene duration: ${duration.toFixed(1)} seconds${range ? " (measured from the recorded narration)" : " (estimated)"}.`,
        "Plan the shots for this scene in order.",
      ].join("\n"),
    });
    await ctx.checkCancelled();
    const total = out.shots.reduce((s, x) => s + Math.max(1, x.durationSeconds), 0) || 1;
    const shots: ShotPlan[] = out.shots.map((s) => ({
      id: newId("shot"),
      description: s.description,
      imagePrompt: s.imagePrompt,
      // Normalise so shots exactly fill the scene.
      duration: Math.max(1, (Math.max(1, s.durationSeconds) / total) * duration),
      motion: s.motion,
      transition: s.transition,
      assetId: null,
    }));
    await updateScript(ctx.projectId, (s) => ({ ...s, scenes: s.scenes.map((sc) => (sc.id === scene.id ? { ...sc, shots } : sc)) }));
    planned += shots.length;
  }
  await touchProject(ctx.projectId, `Visual plan created by ${brain.label}`);

  let imagesQueued = false;
  if (input.generateImages) {
    try {
      await getImageGenerator();
      await enqueue("images.generate", ctx.projectId, { sceneIds: targets.map((s) => s.id) });
      imagesQueued = true;
    } catch (error) {
      if (!(error instanceof ProviderNotConfiguredError)) throw error;
    }
  }
  return { shots: planned, imagesQueued };
}

/** Image generation for planned shots, then placement on the timeline. */
export async function runImages(ctx: JobContext, input: JobInput<"images.generate">): Promise<Record<string, unknown>> {
  const [project, { script }] = await Promise.all([getProject(ctx.projectId), getScript(ctx.projectId)]);
  const generator = await getImageGenerator();
  const work = script.scenes.flatMap((scene) =>
    scene.shots
      .filter((shot) =>
        input.shotIds.length
          ? input.shotIds.includes(shot.id)
          : (input.sceneIds.length === 0 || input.sceneIds.includes(scene.id)) && !shot.assetId,
      )
      .map((shot) => ({ scene, shot })),
  );
  if (work.length === 0) throw userError("There are no planned shots waiting for pictures. Plan the visuals first.");
  let made = 0;
  const failures: string[] = [];
  for (const { scene, shot } of work) {
    await ctx.progress(made / work.length, `${generator.label}: picture ${made + 1} of ${work.length} — ${shot.description.slice(0, 60)}`);
    try {
      const image = await generator.generate({ prompt: shot.imagePrompt, aspectRatio: project.aspectRatio });
      const asset = await storeGenerated({
        projectId: ctx.projectId,
        kind: "image",
        role: "visual",
        name: shot.description.slice(0, 80) || "Generated picture",
        data: image.image,
        extension: image.extension,
        mimeType: image.mimeType,
        provider: generator.id,
        prompt: shot.imagePrompt,
        sceneId: scene.id,
      });
      await updateScript(ctx.projectId, (s) => ({
        ...s,
        scenes: s.scenes.map((sc) =>
          sc.id === scene.id ? { ...sc, shots: sc.shots.map((sh) => (sh.id === shot.id ? { ...sh, assetId: asset.id } : sh)) } : sc,
        ),
      }));
    } catch (error) {
      // Keep going: one failed picture shouldn't lose the others.
      failures.push(`${shot.description.slice(0, 40)}: ${error instanceof Error ? error.message : "failed"}`);
    }
    made++;
    await ctx.checkCancelled();
  }
  await ctx.progress(0.97, "Placing pictures on the timeline");
  await refitVisuals(ctx.projectId, (await getScript(ctx.projectId)).script);
  await touchProject(ctx.projectId, "Pictures created");
  if (failures.length === work.length) throw userError(`No pictures could be created. ${failures[0] ?? ""}`);
  return { created: work.length - failures.length, failed: failures };
}
