import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  backupProject,
  getProject,
  getTimeline,
  projectDirectory,
  registerProjectFiles,
  restoreProjectBackup,
  touchProject,
  updateTimeline,
  type JobInput,
} from "@studio/database";
import { encodeWav, MUSIC_MOODS, probeMedia, SYNTH_PRESETS, synthEffect, synthMusic, type MusicMood, type SynthPreset } from "@studio/media";
import { AgentCancelledError, getClaudeAgentConfig, getSoundGenerator, listBuiltInSkills, runClaudeCode, type Skill } from "@studio/providers";
import type { VideoProps } from "@studio/renderer";
import { renderStills } from "@studio/renderer/render";
import { compileScene, SceneCompileError } from "@studio/renderer/scene-compiler";
import { addClip, addTrack, clipEnd, formatClock, TRANSITIONS, type ParsedSubtitles, type Timeline } from "@studio/timeline";
import { z } from "zod";
import { JobCancelledError, userError, type JobContext } from "../context";
import type { RenderServer } from "./render";

/**
 * START ANIMATING
 *
 * Turns the voiceover + subtitles into an animated cartoon:
 *   1. Understanding the story — Claude reads the subtitles (the most
 *      important file), their emotion hints and any reference images, and
 *      writes plan/scene_plan.json: characters, settings, and shots cut on
 *      the subtitle timings, each with emotion, camera, sounds and music.
 *   2. Building scenes — Claude writes reusable scene components and
 *      plan/shots.json (which component + props each shot uses). The app
 *      places the clips itself at the plan's timings, so the voice and
 *      captions are never touched.
 *   3. Checking its work — the app renders a still from every shot; Claude
 *      looks at them and fixes what's wrong.
 *   4. Sound — sound effects and music from ElevenLabs when connected,
 *      otherwise synthesised by the app.
 */

const STYLE_LOOK: Record<string, string> = {
  "2d-cartoon": "2D cartoon: bold clean shapes, soft cel shading, warm saturated colours, expressive characters with big readable faces.",
  storybook: "Storybook: painted look, soft textured gradients, warm gentle light, rounded friendly shapes, like a children's picture book.",
  anime: "Anime-inspired: clean line art, dramatic lighting and rim light, expressive eyes, cinematic camera angles. Original designs only.",
  "paper-cutout": "Paper cut-out: layered paper shapes with slight drop shadows, visible paper texture, stop-motion feel.",
};

const ShotSchema = z.object({
  id: z.string().min(1),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  cues: z.array(z.number()).default([]),
  setting: z.string().default(""),
  emotion: z.string().default(""),
  description: z.string().default(""),
  camera: z.string().default(""),
  characters: z.array(z.string()).default([]),
  transitionIn: z.enum(TRANSITIONS).default("none"),
});
const PlanSchema = z.object({
  story: z.string().default(""),
  characters: z.array(z.object({ id: z.string(), name: z.string().default(""), look: z.string().default("") })).default([]),
  settings: z.array(z.object({ id: z.string(), description: z.string().default("") })).default([]),
  shots: z.array(ShotSchema).min(1),
  sfx: z
    .array(
      z.object({
        at: z.number().nonnegative(),
        duration: z.number().min(0.3).max(22).default(2),
        prompt: z.string().min(2),
        preset: z.enum(SYNTH_PRESETS).optional(),
        volume: z.number().min(0).max(1).default(0.45),
      }),
    )
    .default([]),
  music: z
    .array(z.object({ start: z.number().nonnegative(), end: z.number().positive(), mood: z.enum(MUSIC_MOODS).default("calm"), prompt: z.string().default("") }))
    .default([]),
});
type Plan = z.infer<typeof PlanSchema>;

const ShotsFileSchema = z.array(
  z.object({
    shot: z.string(),
    component: z.string().regex(/^scenes\/[\w/.-]+\.(tsx|jsx|ts|js)$/, "component must be a file in scenes/"),
    props: z.record(z.string(), z.unknown()).default({}),
    label: z.string().default(""),
  }),
);
type ShotsFile = z.infer<typeof ShotsFileSchema>;

const exists = (p: string) => stat(p).then(() => true, () => false);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

async function listFiles(dir: string, base = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listFiles(path.join(dir, e.name), rel)));
    else out.push(rel);
  }
  return out;
}

function system(skills: Skill[]): string {
  return [
    "You are the animator of a cartoon video studio app. The user has recorded a voiceover and has its subtitles;",
    "you turn them into an animated cartoon. You work only with files in the project folder. You can't run commands —",
    "the app checks, renders and places your work, and makes the sounds from your plan.",
    "",
    "The studio's built-in skills follow. Always apply them.",
    ...skills.map((s) => `\n\n<skill name="${s.name}">\n${s.body}\n</skill>`),
  ].join("\n");
}

function planProblems(plan: Plan, voiceDuration: number): string[] {
  const problems: string[] = [];
  const shots = [...plan.shots].sort((a, b) => a.start - b.start);
  if (shots[0]!.start > 0.6) problems.push(`The first shot starts at ${shots[0]!.start}s; it must start at 0.`);
  if (shots.at(-1)!.end < voiceDuration - 0.6) problems.push(`The last shot ends at ${shots.at(-1)!.end}s but the voiceover lasts ${voiceDuration.toFixed(2)}s.`);
  const ids = new Set<string>();
  for (const [i, s] of shots.entries()) {
    if (ids.has(s.id)) problems.push(`Shot id "${s.id}" is used twice.`);
    ids.add(s.id);
    if (s.end - s.start < 0.8) problems.push(`Shot ${s.id} is only ${(s.end - s.start).toFixed(2)}s long; make shots at least 0.8s.`);
    const next = shots[i + 1];
    if (next && Math.abs(next.start - s.end) > 0.05) problems.push(`There is a gap or overlap between shot ${s.id} (ends ${s.end}) and ${next.id} (starts ${next.start}); shots must be continuous.`);
  }
  return problems.slice(0, 12);
}

export async function runAgentGenerate(ctx: JobContext, input: JobInput<"agent.generate">, server: RenderServer): Promise<Record<string, unknown>> {
  const [project, stored, config, skills, sounds] = await Promise.all([
    getProject(ctx.projectId),
    getTimeline(ctx.projectId),
    getClaudeAgentConfig(),
    listBuiltInSkills(),
    getSoundGenerator(),
  ]);
  const dir = await projectDirectory(ctx.projectId);
  const voice = stored.timeline.clips.find((c) => c.src?.startsWith("input/voice."));
  if (!voice) throw userError("Add the voiceover and subtitles first.");
  if (!(await exists(path.join(dir, "input", "subtitles.json")))) throw userError("Add the subtitle file first.");
  const subtitles = JSON.parse(await readFile(path.join(dir, "input", "subtitles.json"), "utf8")) as ParsedSubtitles;
  const voiceDuration = voice.duration;
  const references = (await listFiles(path.join(dir, "input", "references"))).map((f) => `input/references/${f}`);
  const assets = (await listFiles(path.join(dir, "input", "assets"))).map((f) => `input/assets/${f}`);
  const style = STYLE_LOOK[project.style ?? ""] ?? STYLE_LOOK["2d-cartoon"]!;
  const shape = stored.timeline.ratio;
  await mkdir(path.join(dir, "plan"), { recursive: true });

  await ctx.progress(0.01, "Saving a copy so you can undo");
  const backupName = await backupProject(ctx.projectId);

  let cancelled = false;
  const agent = (prompt: string, range: [number, number], effort: "medium" | "high" = "high") => {
    let steps = 0;
    return runClaudeCode({
      cwd: dir,
      prompt,
      system: system(skills),
      command: config.command,
      model: config.model,
      apiKey: config.apiKey,
      effort,
      timeoutMs: 75 * 60_000,
      onEvent: (e) => {
        steps++;
        const p = range[0] + (range[1] - range[0]) * (1 - Math.exp(-steps / 25));
        ctx.progress(p, e.message).catch(() => {
          cancelled = true;
        });
      },
      shouldCancel: async () => cancelled || (await ctx.cancelled()),
    });
  };

  try {
    // ---- Plan & scene checks (also used to resume an earlier run) -----------
    const readPlan = async (): Promise<{ plan: Plan | null; problems: string[] }> => {
      try {
        const plan = PlanSchema.parse(JSON.parse(await readFile(path.join(dir, "plan", "scene_plan.json"), "utf8")));
        return { plan, problems: planProblems(plan, voiceDuration) };
      } catch (error) {
        return { plan: null, problems: [error instanceof z.ZodError ? error.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : `plan/scene_plan.json can't be read: ${String(error)}`] };
      }
    };
    /** Shots in order, snapped so the picture always covers the whole voiceover. */
    const sortedShots = (p: Plan) => {
      const list = [...p.shots].sort((a, b) => a.start - b.start);
      list[0]!.start = 0;
      list.at(-1)!.end = Math.max(list.at(-1)!.end, voiceDuration);
      return list;
    };
    const readShots = async (planned: Plan["shots"]): Promise<{ shotsFile: ShotsFile | null; problems: string[] }> => {
      let shotsFile: ShotsFile;
      try {
        shotsFile = ShotsFileSchema.parse(JSON.parse(await readFile(path.join(dir, "plan", "shots.json"), "utf8")));
      } catch (error) {
        return { shotsFile: null, problems: [`plan/shots.json: ${error instanceof z.ZodError ? error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : String(error)}`] };
      }
      const found: string[] = [];
      const byShot = new Set(shotsFile.map((e) => e.shot));
      for (const shot of planned) if (!byShot.has(shot.id)) found.push(`Shot ${shot.id} has no entry in plan/shots.json.`);
      for (const component of new Set(shotsFile.map((e) => e.component))) {
        if (!(await exists(path.join(dir, ...component.split("/"))))) {
          found.push(`${component} doesn't exist.`);
          continue;
        }
        try {
          await compileScene(dir, component);
        } catch (error) {
          found.push(`${component} doesn't compile: ${error instanceof SceneCompileError ? error.message : String(error)}`);
        }
      }
      return { shotsFile, problems: found.slice(0, 12) };
    };

    // Resume: when an earlier run already planned and built working scenes, keep them.
    let { plan, problems } = await readPlan();
    let shots = plan && !problems.length ? sortedShots(plan) : [];
    let built: { shotsFile: ShotsFile | null; problems: string[] } = plan && !problems.length ? await readShots(shots) : { shotsFile: null, problems: ["not built yet"] };
    let buildResult: { summary: string } = { summary: "" };
    const resumed = Boolean(plan && !problems.length && built.shotsFile && !built.problems.length);

    if (resumed) {
      await ctx.progress(0.66, "Reusing the plan and scenes from the last run");
    } else {
      // ---- 1. Understanding the story ----------------------------------------
      await ctx.progress(0.03, "Understanding the story");
      const planPrompt = [
        "# Step 1 of 2: understand the story and plan the shots",
        "",
        "Read `input/subtitles.json` first — it is the most important file. It has every subtitle line (`cues`: index, start, end, text, tags)",
        "with exact timing in seconds, and `emotionHints` (delivery tags like serious, sad, excited) at the time they apply.",
        `The voiceover is ${voiceDuration.toFixed(2)} s long (${formatClock(voiceDuration)}). Language: ${project.language}.`,
        references.length ? `Look at these reference images — characters and places must match them:\n${references.map((r) => `- ${r}`).join("\n")}` : "There are no reference images.",
        assets.length ? `The user attached these assets you may use in scenes (import pictures from scene files):\n${assets.slice(0, 80).map((a) => `- ${a}`).join("\n")}` : "",
        input.notes ? `Direction from the user: ${input.notes}` : "",
        `Look: ${style}`,
        `The video is edited in ${shape} and must also work in 16:9, 9:16, 4:5 and 1:1.`,
        "",
        "Understand the story: who the characters are, where it happens, what happens, and the emotional arc.",
        "Then write `plan/scene_plan.json` with exactly this shape:",
        "```json",
        JSON.stringify(
          {
            story: "2–4 sentences: what happens and how it should feel",
            characters: [{ id: "emon", name: "Emon", look: "what he looks like: age, hair, clothes, colours" }],
            settings: [{ id: "interview-room", description: "what the place looks like and its light" }],
            shots: [
              { id: "s01", start: 0, end: 6.363, cues: [1], setting: "interview-room", emotion: "nervous", description: "what we see and what moves", camera: "slow push-in on Emon", characters: ["emon"], transitionIn: "none" },
            ],
            sfx: [{ at: 4.2, duration: 1.5, prompt: "chair creaks in a quiet office", preset: "click", volume: 0.4 }],
            music: [{ start: 0, end: 60, mood: "tense", prompt: "soft tense piano and low strings, slow" }],
          },
          null,
          2,
        ),
        "```",
        "Rules for the plan:",
        `- Shots are continuous: the first starts at 0, each starts where the previous ends, the last ends at ${voiceDuration.toFixed(3)}.`,
        "- Cut on subtitle boundaries (a cue's start) — never in the middle of a phrase. Usually one shot per cue; merge very short cues,",
        "  split long ones only at a pause. Most shots are 3–8 s.",
        "- Every shot's emotion follows the words and the emotion hints; big moments (a twist, a question, a realisation) get a",
        "  closer camera or a change of shot exactly on that line.",
        "- Reuse settings: a story usually needs only a few places. Use transitions as the flowing-transitions skill says (mostly cuts).",
        `- sfx: real moments only (doors, footsteps, keyboard, rain…), prompts in English. ${sounds ? "ElevenLabs is connected: write good descriptive prompts." : `ElevenLabs is NOT connected, so every sfx MUST have a \`preset\` from: ${SYNTH_PRESETS.join(", ")}.`}`,
        `- music: a few segments covering the story, mood from: ${MUSIC_MOODS.join(", ")}. The music may stop for a dramatic line.`,
        "",
        "Write only `plan/scene_plan.json` in this step. Then reply with one sentence describing the story.",
      ]
        .filter(Boolean)
        .join("\n");
      await agent(planPrompt, [0.04, 0.2]);
      ({ plan, problems } = await readPlan());
      if (problems.length) {
        await ctx.progress(0.2, "Fixing the scene plan");
        await agent(["Fix these problems in plan/scene_plan.json (keep everything else):", ...problems.map((x) => `- ${x}`)].join("\n"), [0.2, 0.24], "medium");
        ({ plan, problems } = await readPlan());
      }
      if (!plan || problems.length) throw userError(`Claude couldn't make a usable scene plan. (${problems[0] ?? "unknown problem"})`);
      shots = sortedShots(plan);
      await ctx.checkCancelled();

      // ---- 2. Building scenes --------------------------------------------------
      await ctx.progress(0.25, `Building ${shots.length} shots`);
      const kitExists = await exists(path.join(dir, "scenes"));
      const buildPrompt = [
        "# Step 2 of 2: build the scenes",
        "",
        "Read `plan/scene_plan.json` (your plan). Now write the animation:",
        "- Write REUSABLE components: one component per setting/situation in `scenes/` (e.g. `scenes/InterviewRoom.tsx`), and each",
        "  character once in `scenes/characters/` (e.g. `scenes/characters/Emon.tsx`) with props for pose, expression, mouth (talking),",
        "  blinking, looking direction and walking. Put shared helpers (a ratio-aware stage/camera, sky, lights) in `scenes/kit.tsx`.",
        kitExists ? "  Some files already exist in scenes/ — reuse them when they fit." : "",
        "- A shot = a component + props. Shots in the same place use the same component with different props (camera framing,",
        "  who is in frame, expression, action, light, time of day). Each component must use the clip's own time (useCurrentFrame from 0).",
        "- Make it look good and alive: depth (foreground/midground/background), soft shadows and light, gentle constant motion",
        "  (breathing, blinking, camera drift), characters that act the emotion of the line. Talking characters move their mouths",
        "  while their line is spoken. Use the reference images for character looks when there are any.",
        "- Frame for every shape (16:9, 9:16, 4:5, 1:1): use the `ratio` prop and useVideoConfig width/height; keep faces and key",
        "  action inside the safe area; re-frame for vertical instead of squeezing. Keep space at the bottom ~15% for captions.",
        "- Expose useful adjustable props (numbers, booleans, strings, #colours) with defaults — they appear as sliders in the editor.",
        "- Then write `plan/shots.json`: an array with one entry per shot in the plan, in order:",
        '  `[{ "shot": "s01", "component": "scenes/InterviewRoom.tsx", "label": "Emon waits", "props": { "camera": "close", "expression": "nervous" } }]`',
        "- Do NOT edit project.json — the app places the clips at the plan's timings.",
        "",
        "Finish with one or two plain sentences for the user about the look of the animation.",
      ]
        .filter(Boolean)
        .join("\n");
      buildResult = await agent(buildPrompt, [0.26, 0.66]);
      built = await readShots(shots);
      if (built.problems.length) {
        await ctx.progress(0.66, "Fixing scene problems");
        await agent(["Fix these problems (keep the animation as planned):", ...built.problems.map((x) => `- ${x}`)].join("\n"), [0.66, 0.7], "medium");
        built = await readShots(shots);
      }
    }
    if (!plan || !built.shotsFile || built.problems.length) throw userError(`Claude's scenes didn't work, so your project was left as it was. (${built.problems[0] ?? "unknown problem"})`);

    const placeScenes = async (entries: ShotsFile) => {
      const byShot = new Map(entries.map((e) => [e.shot, e]));
      await updateTimeline(
        ctx.projectId,
        (t0) => {
          let t: Timeline = t0;
          let track = t.tracks.find((tr) => tr.role === "scenes");
          if (!track) ({ timeline: t, track } = addTrack(t, "scenes"));
          if (track.locked) t = { ...t, tracks: t.tracks.map((tr) => (tr.id === track!.id ? { ...tr, locked: false } : tr)) };
          t = { ...t, clips: t.clips.filter((c) => !(c.trackId === track!.id && c.kind === "scene")) };
          for (const [i, s] of shots.entries()) {
            const entry = byShot.get(s.id)!;
            t = addClip(t, {
              trackId: track.id,
              kind: "scene",
              component: entry.component,
              props: entry.props,
              label: entry.label || s.description.slice(0, 40) || s.id,
              start: r3(s.start),
              duration: r3(s.end - s.start),
              transition: i === 0 ? "none" : s.transitionIn,
              transitionDuration: 0.6,
              meta: { source: "agent", shot: s.id, emotion: s.emotion, setting: s.setting },
            }).timeline;
          }
          return t;
        },
        "agent",
      );
    };
    await placeScenes(built.shotsFile);
    await ctx.checkCancelled();

    // ---- 3. Checking its work -------------------------------------------------
    await ctx.progress(0.7, "Rendering previews to check the shots");
    const checkpoint = await backupProject(ctx.projectId);
    const { timeline } = await getTimeline(ctx.projectId);
    const versions: Record<string, string> = {};
    for (const f of new Set(built.shotsFile.map((s) => s.component))) versions[f] = String((await stat(path.join(dir, ...f.split("/")))).mtimeMs);
    const props: VideoProps = { timeline, ratio: shape, fileBase: server.fileBase(ctx.projectId), sceneBase: server.sceneBase(ctx.projectId), versions, fps: timeline.fps };
    const sample = shots.length <= 24 ? shots : shots.filter((_, i) => i % Math.ceil(shots.length / 24) === 0);
    await mkdir(path.join(dir, "previews"), { recursive: true });
    const stills = await renderStills({
      props,
      stills: sample.map((s) => ({ frame: Math.round(((s.start + s.end) / 2) * timeline.fps), outputPath: path.join(dir, "previews", `${s.id}.png`) })),
      scale: 0.5,
      onStill: (done, total) => void ctx.progress(0.7 + 0.06 * (done / total), `Rendering previews (${done} of ${total})`).catch(() => (cancelled = true)),
    });
    const rendered = stills.filter((s) => !s.error);
    const broken = stills.filter((s) => s.error).map((s) => `${path.basename(s.outputPath, ".png")}: ${s.error}`);
    if (rendered.length || broken.length) {
      await ctx.progress(0.77, "Claude is checking the previews");
      buildResult = await agent(
        [
          "# Check your work",
          "The app rendered one still from the middle of these shots (shape " + shape + "). Look at each image and compare it with the plan:",
          ...rendered.map((s) => `- previews/${path.basename(s.outputPath)} → shot ${path.basename(s.outputPath, ".png")}`),
          broken.length ? `These shots failed to render — fix them:\n${broken.map((b) => `- ${b}`).join("\n")}` : "",
          "Fix real problems in the scene files or in plan/shots.json props: characters cut off by the frame edge, faces hidden,",
          "wrong pose or emotion, empty or broken frames, unreadable or mirrored text, too dark or too bright, ugly overlaps.",
          "Don't change what already looks right. Do NOT edit project.json — the app places the clips from plan/shots.json.",
          "Finish with one or two plain sentences for the user about the animation.",
        ]
          .filter(Boolean)
          .join("\n"),
        [0.78, 0.86],
        "medium",
      );
      const reviewed = await readShots(shots);
      if (reviewed.shotsFile && !reviewed.problems.length) await placeScenes(reviewed.shotsFile);
      else {
        // The review broke something: keep the version that worked.
        await restoreProjectBackup(ctx.projectId, checkpoint);
      }
    }
    await ctx.checkCancelled();

    // ---- 4. Sound -------------------------------------------------------------
    await ctx.progress(0.87, sounds ? "Creating sound effects and music with ElevenLabs" : "Creating sound effects and music");
    await mkdir(path.join(dir, "audio", "sfx"), { recursive: true });
    await mkdir(path.join(dir, "audio", "music"), { recursive: true });
    const notes: string[] = [];
    const made: Array<{ kind: "sfx" | "music"; path: string; at: number; length: number; volume: number; prompt: string; label: string }> = [];
    const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "sound";

    const sfxList = plan.sfx.filter((s) => s.at < voiceDuration).slice(0, 40);
    for (const [i, s] of sfxList.entries()) {
      await ctx.progress(0.87 + 0.06 * (i / Math.max(1, sfxList.length)), `Sound effect ${i + 1} of ${sfxList.length}: ${s.prompt.slice(0, 50)}`);
      let file: string | null = null;
      if (sounds) {
        try {
          file = `audio/sfx/${String(i + 1).padStart(2, "0")}-${slug(s.prompt)}.mp3`;
          await writeFile(path.join(dir, ...file.split("/")), await sounds.soundEffect(s.prompt, s.duration));
        } catch (error) {
          file = null;
          if (!notes.length) notes.push(`Some sound effects couldn't be made with ElevenLabs (${error instanceof Error ? error.message : "error"}).`);
        }
      }
      if (!file && s.preset) {
        file = `audio/sfx/${String(i + 1).padStart(2, "0")}-${s.preset}.wav`;
        await writeFile(path.join(dir, ...file.split("/")), encodeWav(synthEffect(s.preset as SynthPreset, s.duration, i + 1)));
      }
      if (file) made.push({ kind: "sfx", path: file, at: s.at, length: s.duration, volume: Math.min(0.5, s.volume), prompt: s.prompt, label: s.prompt.slice(0, 40) });
    }

    const musicList = plan.music.filter((m) => m.end > m.start).slice(0, 8);
    for (const [i, m] of musicList.entries()) {
      const length = Math.min(m.end, voiceDuration) - m.start;
      if (length < 2) continue;
      await ctx.progress(0.93 + 0.04 * (i / Math.max(1, musicList.length)), `Music ${i + 1} of ${musicList.length} (${m.mood})`);
      let file: string | null = null;
      if (sounds) {
        try {
          file = `audio/music/${String(i + 1).padStart(2, "0")}-${m.mood}.mp3`;
          await writeFile(path.join(dir, ...file.split("/")), await sounds.music(m.prompt || `${m.mood} instrumental background music for a cartoon`, length));
        } catch (error) {
          file = null;
          notes.push(`Music was made by the app instead of ElevenLabs (${error instanceof Error ? error.message : "error"}).`);
        }
      }
      if (!file) {
        file = `audio/music/${String(i + 1).padStart(2, "0")}-${m.mood}.wav`;
        await writeFile(path.join(dir, ...file.split("/")), encodeWav(synthMusic(m.mood as MusicMood, length)));
      }
      made.push({ kind: "music", path: file, at: m.start, length, volume: 0.5, prompt: m.prompt, label: `Music · ${m.mood}` });
    }

    // Real lengths (generated files can differ from what was asked).
    for (const m of made) {
      try {
        const info = await probeMedia(path.join(dir, ...m.path.split("/")));
        if (info.durationSeconds) m.length = m.kind === "music" ? Math.min(m.length, info.durationSeconds) : info.durationSeconds;
      } catch {
        // keep the planned length
      }
    }

    await updateTimeline(
      ctx.projectId,
      (t0) => {
        let t: Timeline = { ...t0, clips: t0.clips.filter((c) => !(c.meta.source === "agent" && c.kind === "audio")) };
        const trackFor = (role: "sfx" | "music", start: number, end: number) => {
          const candidates = t.tracks.filter((tr) => tr.role === role && !tr.locked);
          const free = candidates.find((tr) => t.clips.filter((c) => c.trackId === tr.id).every((c) => end <= c.start + 1e-3 || start >= clipEnd(c) - 1e-3));
          if (free) return free.id;
          const added = addTrack(t, role);
          t = added.timeline;
          return added.track.id;
        };
        for (const m of made) {
          const end = Math.min(voiceDuration, m.at + m.length);
          if (end - m.at < 0.2) continue;
          t = addClip(t, {
            trackId: trackFor(m.kind, m.at, end),
            kind: "audio",
            src: m.path,
            label: m.label,
            start: r3(m.at),
            duration: r3(end - m.at),
            sourceDuration: r3(m.length),
            volume: m.volume,
            fadeIn: m.kind === "music" ? 1.5 : 0,
            fadeOut: m.kind === "music" ? 2 : Math.min(0.3, (end - m.at) / 3),
            meta: { source: "agent", prompt: m.prompt },
          }).timeline;
        }
        return t;
      },
      "agent",
    );
    await registerProjectFiles(
      ctx.projectId,
      made.map((m) => ({ path: m.path, role: m.kind, name: m.label, prompt: m.prompt })),
    );

    await touchProject(ctx.projectId, "Animated by Claude");
    const summary = [plan.story, buildResult.summary].filter(Boolean).join("\n\n");
    return {
      summary: `${shots.length} shots, ${made.filter((m) => m.kind === "sfx").length} sound effects and ${made.filter((m) => m.kind === "music").length} music parts.\n\n${summary}`.trim(),
      shots: shots.length,
      backup: backupName,
      notes,
    };
  } catch (error) {
    // Put the timeline back, but keep the plan and scene files so "Start animating" can resume.
    await restoreProjectBackup(ctx.projectId, backupName, { scenes: false }).catch(() => {});
    if (error instanceof AgentCancelledError) throw new JobCancelledError();
    throw error;
  }
}
