import { z } from "zod";
import { getProject, touchProject, updateScript, type JobInput } from "@studio/database";
import { getBrain } from "@studio/providers";
import { newSceneId, type Script } from "@studio/timeline";
import type { JobContext } from "../context";
import { storySystemPrompt, WORDS_PER_MINUTE } from "../prompts";

/** What the story agent must return. Every field is required (strict schemas). */
export const StoryOutputSchema = z.object({
  title: z.string(),
  logline: z.string(),
  scenes: z.array(
    z.object({
      title: z.string(),
      narration: z.string(),
      visualDirection: z.string(),
      mood: z.string(),
      estimatedSeconds: z.number(),
    }),
  ),
});
export type StoryOutput = z.infer<typeof StoryOutputSchema>;

export function storyToScenes(story: StoryOutput): Script["scenes"] {
  return story.scenes
    .filter((s) => s.narration.trim())
    .map((s) => ({
      id: newSceneId(),
      title: s.title.trim(),
      narration: s.narration.trim(),
      visualDirection: s.visualDirection.trim(),
      mood: s.mood.trim(),
      estimatedDuration: Math.max(5, Math.round(s.estimatedSeconds)),
      narrationAssetId: null,
      shots: [],
    }));
}

export async function runStoryWrite(ctx: JobContext, input: JobInput<"story.write">): Promise<Record<string, unknown>> {
  const project = await getProject(ctx.projectId);
  const brain = await getBrain();
  await ctx.progress(0.05, `${brain.label} is researching and writing`);
  const words = Math.round(input.targetMinutes * (WORDS_PER_MINUTE[project.language] ?? 120));
  const scenes = Math.max(3, Math.min(14, Math.round(input.targetMinutes * 1.6)));
  const story = await brain.generateJson({
    system: storySystemPrompt(project.language),
    schemaName: "documentary_script",
    effort: "high",
    schema: StoryOutputSchema,
    prompt: [
      `Write a complete documentary script.`,
      `Topic / idea: ${input.topic}`,
      input.instructions ? `Additional instructions from the producer: ${input.instructions}` : "",
      `Target length: about ${input.targetMinutes} minutes of narration (roughly ${words} spoken words in total), in about ${scenes} scenes.`,
      `Visual style of the film: ${project.visualStyle}. Format: ${project.aspectRatio}.`,
      "Return the title and logline in the narration language.",
    ]
      .filter(Boolean)
      .join("\n"),
  });
  await ctx.checkCancelled();
  const newScenes = storyToScenes(story);
  if (newScenes.length === 0) throw new Error("The AI returned an empty script. Try again with more detail about the topic.");
  await updateScript(ctx.projectId, (s) => ({ ...s, title: story.title, logline: story.logline, language: project.language, scenes: newScenes, approvedAt: null }));
  await touchProject(ctx.projectId, `Script written by ${brain.label}`);
  return { scenes: newScenes.length, title: story.title };
}
