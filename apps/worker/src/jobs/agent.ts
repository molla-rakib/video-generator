import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  backupProject,
  getProject,
  projectDirectory,
  restoreProjectBackup,
  getTimeline,
  projectFile,
  registerProjectFiles,
  touchProject,
  updateTimeline,
  type JobInput,
} from "@studio/database";
import { AgentCancelledError, getClaudeAgentConfig, listBuiltInSkills, runClaudeCode, type Skill } from "@studio/providers";
import { compileScene, SceneCompileError } from "@studio/renderer/scene-compiler";
import { formatClock, parseTimeline, referencedFiles, type Clip, type Timeline } from "@studio/timeline";
import { ZodError } from "zod";
import { JobCancelledError, userError, type JobContext } from "../context";

const exists = (p: string) => stat(p).then(() => true, () => false);

/**
 * "Ask Claude": the user selects clips and/or a time range on the timeline
 * and describes a change. Claude Code edits project.json and scene files in
 * the project folder, guided by the studio's built-in skills. The result is
 * checked; anything broken is sent back once, and if it still fails the
 * project is restored exactly as it was.
 */

function systemPrompt(skills: Skill[]): string {
  return [
    "You are the animator and editor for a cartoon video studio app. The user edits videos on a timeline;",
    "you change the project files when they ask. The app validates your work after you finish.",
    "You cannot run commands or create audio files in this kind of job: reuse audio already in the project (audio/, media/),",
    "and if the request needs a new sound you can't make, say so in your summary.",
    "",
    "The studio's built-in skills follow. Always apply them.",
    ...skills.map((s) => `\n\n<skill name="${s.name}">\n${s.body}\n</skill>`),
  ].join("\n");
}

function describeClip(clip: Clip, timeline: Timeline): string {
  const track = timeline.tracks.find((t) => t.id === clip.trackId);
  const facts: Record<string, unknown> = {
    id: clip.id,
    kind: clip.kind,
    track: `${track?.name ?? clip.trackId} (${track?.role ?? "?"})`,
    label: clip.label || undefined,
    start: clip.start,
    end: Math.round((clip.start + clip.duration) * 1000) / 1000,
    component: clip.component ?? undefined,
    src: clip.src ?? undefined,
    props: Object.keys(clip.props).length ? clip.props : undefined,
    text: clip.text || undefined,
    volume: clip.kind === "audio" || clip.kind === "video" ? clip.volume : undefined,
    transition: clip.transition !== "none" ? `${clip.transition} (${clip.transitionDuration}s)` : undefined,
  };
  return `- ${JSON.stringify(facts)}`;
}

function requestPrompt(input: JobInput<"agent.revise">, timeline: Timeline): string {
  const selected = input.clipIds.map((id) => timeline.clips.find((c) => c.id === id)).filter((c): c is Clip => Boolean(c));
  const inRange = input.range
    ? timeline.clips.filter((c) => c.start < input.range!.end && c.start + c.duration > input.range!.start && !input.clipIds.includes(c.id))
    : [];
  const selection: string[] = [`- Shape being edited: ${timeline.ratio} (exported as ${timeline.ratios.join(", ")})`];
  if (selected.length) selection.push(`- Selected clips (change these):`, ...selected.map((c) => describeClip(c, timeline)));
  if (input.range) {
    selection.push(`- Selected time range: ${input.range.start.toFixed(2)} s – ${input.range.end.toFixed(2)} s (${formatClock(input.range.start)}–${formatClock(input.range.end)})`);
    if (inRange.length) selection.push(`- Clips inside that range:`, ...inRange.map((c) => describeClip(c, timeline)));
  }
  if (!selected.length && !input.range) selection.push("- Nothing is selected: the request is about the whole video.");
  return [
    "# The user's request",
    input.request,
    "",
    "# What they selected on the timeline",
    ...selection,
    "",
    "# What to do",
    "1. Read project.json and whatever scene files you need.",
    "2. Make the change — only to the selection, unless the request clearly asks for more.",
    "3. Keep project.json valid (same format, same ids, no overlapping clips on a track).",
    "4. Finish with one or two plain sentences for the user saying what you changed.",
  ].join("\n");
}

/** Problems with the project after the agent's change (empty = fine). */
async function findProblems(dir: string): Promise<string[]> {
  let timeline: Timeline;
  try {
    timeline = parseTimeline(JSON.parse(await readFile(path.join(dir, "project.json"), "utf8")));
  } catch (error) {
    if (error instanceof ZodError) return error.issues.slice(0, 8).map((i) => `project.json → ${i.path.join(".") || "(root)"}: ${i.message}`);
    return [`project.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`];
  }
  const problems: string[] = [];
  for (const file of referencedFiles(timeline)) {
    if (!(await exists(path.join(dir, ...file.split("/"))))) problems.push(`${file} is used in project.json but doesn't exist.`);
  }
  for (const component of new Set(timeline.clips.map((c) => c.component).filter((c): c is string => Boolean(c)))) {
    if (!(await exists(path.join(dir, ...component.split("/"))))) continue;
    try {
      await compileScene(dir, component);
    } catch (error) {
      problems.push(`${component} doesn't compile: ${error instanceof SceneCompileError ? error.message : String(error)}`);
    }
  }
  for (const track of timeline.tracks) {
    const clips = timeline.clips.filter((c) => c.trackId === track.id).sort((a, b) => a.start - b.start);
    for (let i = 1; i < clips.length; i++) {
      if (clips[i]!.start < clips[i - 1]!.start + clips[i - 1]!.duration - 0.001) problems.push(`Clips ${clips[i - 1]!.id} and ${clips[i]!.id} overlap on track ${track.id}.`);
    }
  }
  return problems;
}

export async function runAgentRevise(ctx: JobContext, input: JobInput<"agent.revise">): Promise<Record<string, unknown>> {
  const [, stored, config, skills] = await Promise.all([getProject(ctx.projectId), getTimeline(ctx.projectId), getClaudeAgentConfig(), listBuiltInSkills()]);
  const dir = await projectDirectory(ctx.projectId);
  await ctx.progress(0.03, "Saving a copy so you can undo");
  const backupName = await backupProject(ctx.projectId);

  let steps = 0;
  let cancelled = false;
  let restored = false;
  const run = (prompt: string) =>
    runClaudeCode({
      cwd: dir,
      prompt,
      system: systemPrompt(skills),
      command: config.command,
      model: config.model,
      apiKey: config.apiKey,
      onEvent: (e) => {
        steps++;
        ctx.progress(Math.min(0.9, 0.06 + steps * 0.03), e.message).catch(() => {
          cancelled = true;
        });
      },
      shouldCancel: async () => cancelled || (await ctx.cancelled()),
    });

  try {
    await ctx.progress(0.05, "Claude is reading the project");
    let result = await run(requestPrompt(input, stored.timeline));
    let problems = await findProblems(dir);
    if (problems.length) {
      await ctx.progress(0.9, "Fixing a problem Claude left behind");
      result = await run(
        ["Your change left these problems. Fix them, keeping the user's requested change, then summarise again in one or two sentences.", "", ...problems.map((p) => `- ${p}`)].join("\n"),
      );
      problems = await findProblems(dir);
    }
    if (problems.length) {
      await restoreProjectBackup(ctx.projectId, backupName);
      restored = true;
      throw userError(`Claude's change didn't work, so your project was left exactly as it was. (${problems[0]})`);
    }

    // Stamp the change so every open editor reloads it.
    await updateTimeline(ctx.projectId, (t) => t, "agent");
    const { timeline } = await getTimeline(ctx.projectId);
    const media = referencedFiles(timeline).filter((p) => !p.endsWith(".tsx") && !p.endsWith(".ts"));
    await registerProjectFiles(ctx.projectId, media.map((p) => ({ path: p, role: p.includes("/music/") ? "music" : p.includes("/sfx/") ? "sfx" : null })));
    await touchProject(ctx.projectId, "Changed by Claude");
    return { summary: result.summary, backup: backupName, costUsd: result.costUsd };
  } catch (error) {
    // Whatever went wrong, leave the project exactly as it was before.
    if (!restored) await restoreProjectBackup(ctx.projectId, backupName).catch(() => {});
    if (error instanceof AgentCancelledError) throw new JobCancelledError();
    throw error;
  }
}
