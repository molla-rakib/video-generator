import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  backupProject,
  currentInputs,
  freshProgress,
  getProject,
  getTimeline,
  hashFile,
  loadProgress,
  projectDirectory,
  registerProjectFiles,
  restoreProjectBackup,
  sameInputs,
  saveProgress,
  sha,
  touchProject,
  updateTimeline,
  type JobInput,
  type Progress,
} from "@studio/database";
import { encodeWav, MUSIC_MOODS, probeMedia, SYNTH_PRESETS, synthEffect, synthMusic, type MusicMood, type SynthPreset } from "@studio/media";
import {
  AgentCancelledError,
  getClaudeAgentConfig,
  getSoundGenerator,
  listBuiltInSkills,
  runClaudeCode,
  SessionNotFoundError,
  stopProcess,
  type Skill,
} from "@studio/providers";
import type { VideoProps } from "@studio/renderer";
import { renderStills } from "@studio/renderer/render";
import { compileScene, SceneCompileError } from "@studio/renderer/scene-compiler";
import { addClip, addTrack, clipEnd, formatClock, TRANSITIONS, type Timeline } from "@studio/timeline";
import { z } from "zod";
import { JobCancelledError, userError, type JobContext } from "../context";
import type { RenderServer } from "./render";

/**
 * START ANIMATING — resumable
 *
 *   1. Understanding the story  → plan/scene_plan.json
 *   2. Building the scenes       → plan/build_manifest.json, then one
 *                                  component at a time (each checked and
 *                                  placed on the timeline as soon as it works)
 *   3. Checking its work         → stills reviewed by Claude
 *   4. Sound effects and music   → one file at a time, never made twice
 *
 * Everything finished is recorded in plan/progress.json. A stopped, failed or
 * interrupted run (page reload, closed project, worker restart) continues from
 * there, in the same Claude conversation when possible. "Start over" (mode
 * "restart") throws the earlier work away. See docs/GENERATION_RESUME.md.
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

const ComponentPath = z.string().regex(/^scenes\/[\w/.-]+\.(tsx|jsx|ts|js)$/, "component must be a file in scenes/");
const ShotEntrySchema = z.object({
  shot: z.string(),
  component: ComponentPath,
  props: z.record(z.string(), z.unknown()).default({}),
  label: z.string().default(""),
});
type ShotEntry = z.infer<typeof ShotEntrySchema>;
const ManifestSchema = z.object({
  components: z
    .array(z.object({ path: ComponentPath, role: z.enum(["kit", "character", "place", "other"]).default("place"), description: z.string().default("") }))
    .min(1),
  shots: z.array(ShotEntrySchema).min(1),
});
type Manifest = z.infer<typeof ManifestSchema>;

const ROLE_ORDER = { kit: 0, character: 1, other: 2, place: 3 } as const;

const exists = (p: string) => stat(p).then(() => true, () => false);
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const zodText = (error: unknown, file: string) =>
  error instanceof z.ZodError ? `${file}: ${error.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` : `${file} can't be read: ${String(error)}`;

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
  const voiceDuration = voice.duration;
  const references = (await listFiles(path.join(dir, "input", "references"))).map((f) => `input/references/${f}`);
  const assets = (await listFiles(path.join(dir, "input", "assets"))).map((f) => `input/assets/${f}`);
  const styleId = project.style ?? "2d-cartoon";
  const style = STYLE_LOOK[styleId] ?? STYLE_LOOK["2d-cartoon"]!;
  const shape = stored.timeline.ratio;
  const file = (rel: string) => path.join(dir, ...rel.split("/"));
  await mkdir(path.join(dir, "plan"), { recursive: true });

  // ---- Progress: continue, or start (over) ----------------------------------
  let progress = await loadProgress(dir);
  // A "Continue" without new directions keeps the directions of the first run.
  const notes = input.mode === "continue" && !input.notes && progress ? progress.inputs.notes : input.notes;
  const inputs = await currentInputs(dir, voice.src!, styleId, notes);
  if (progress?.agentPid) stopProcess(progress.agentPid); // a Claude left behind by a crashed worker
  const startingOver = input.mode === "restart" || !progress || !sameInputs(progress.inputs, inputs);
  if (startingOver) {
    await ctx.progress(0.01, progress ? "Starting over" : "Saving a copy so you can undo");
    const backup = await backupProject(ctx.projectId);
    if (progress) {
      // Throw away the earlier attempt: its plan, scenes, previews and the clips it placed.
      await Promise.all(["plan", "scenes", "previews"].map((d) => rm(path.join(dir, d), { recursive: true, force: true })));
      await mkdir(path.join(dir, "plan"), { recursive: true });
      await updateTimeline(ctx.projectId, (t) => ({ ...t, clips: t.clips.filter((c) => c.meta.source !== "agent") }), "agent");
    }
    progress = { ...freshProgress(inputs), backup };
  } else {
    await ctx.progress(0.01, "Continuing where it stopped");
  }
  const p: Progress = progress!;
  const save = () => saveProgress(dir, p);
  await save();

  // ---- Claude, in a kept conversation per step -----------------------------
  let cancelled = false;
  let latest = { value: 0.01, message: "" };
  const report = (value: number, message: string) => {
    latest = { value, message };
    ctx.progress(value, message).catch(() => {
      cancelled = true;
    });
  };
  /**
   * Run Claude in the conversation kept for `step`, continuing it when it
   * exists. If it can't be continued, start a fresh one with `recap`.
   */
  const agent = async (step: "plan" | "build", prompt: string, range: [number, number], options: { effort?: "medium" | "high"; recap?: string } = {}) => {
    let steps = 0;
    const holder = step === "plan" ? p.plan : p.build;
    const run = (session: { id: string; resume: boolean }, text: string) =>
      runClaudeCode({
        cwd: dir,
        prompt: text,
        system: system(skills),
        command: config.command,
        model: config.model,
        apiKey: config.apiKey,
        effort: options.effort ?? "high",
        timeoutMs: 75 * 60_000,
        session,
        onStart: (pid) => {
          p.agentPid = pid;
          void save();
        },
        onEvent: (e) => {
          steps++;
          report(range[0] + (range[1] - range[0]) * (1 - Math.exp(-steps / 25)), e.message);
        },
        shouldCancel: async () => cancelled || (await ctx.cancelled()),
      });
    try {
      if (holder.sessionId) {
        try {
          return await run({ id: holder.sessionId, resume: true }, prompt);
        } catch (error) {
          if (!(error instanceof SessionNotFoundError)) throw error;
          // The conversation is gone (expired or deleted): carry on in a new one.
        }
      }
      holder.sessionId = randomUUID();
      await save();
      return await run({ id: holder.sessionId, resume: false }, options.recap ? `${options.recap}\n\n${prompt}` : prompt);
    } finally {
      p.agentPid = null;
      await save();
    }
  };

  // ---- Readers --------------------------------------------------------------
  const readPlan = async (): Promise<{ plan: Plan | null; problems: string[] }> => {
    try {
      const plan = PlanSchema.parse(JSON.parse(await readFile(file("plan/scene_plan.json"), "utf8")));
      return { plan, problems: planProblems(plan, voiceDuration) };
    } catch (error) {
      return { plan: null, problems: [zodText(error, "plan/scene_plan.json")] };
    }
  };
  const sortedShots = (plan: Plan) => {
    const list = [...plan.shots].sort((a, b) => a.start - b.start);
    list[0]!.start = 0;
    list.at(-1)!.end = Math.max(list.at(-1)!.end, voiceDuration);
    return list;
  };
  const readManifest = async (shots: Plan["shots"]): Promise<{ manifest: Manifest | null; problems: string[] }> => {
    let manifest: Manifest;
    try {
      manifest = ManifestSchema.parse(JSON.parse(await readFile(file("plan/build_manifest.json"), "utf8")));
    } catch (error) {
      return { manifest: null, problems: [zodText(error, "plan/build_manifest.json")] };
    }
    const problems: string[] = [];
    const listed = new Set(manifest.components.map((c) => c.path));
    const mapped = new Set(manifest.shots.map((s) => s.shot));
    for (const s of shots) if (!mapped.has(s.id)) problems.push(`Shot ${s.id} has no entry in "shots".`);
    for (const s of manifest.shots) if (!listed.has(s.component)) problems.push(`Shot ${s.shot} uses ${s.component}, which isn't in "components".`);
    return { manifest, problems: problems.slice(0, 12) };
  };
  const checkComponent = async (rel: string): Promise<string | null> => {
    if (!(await exists(file(rel)))) return `${rel} doesn't exist yet.`;
    try {
      await compileScene(dir, rel);
      return null;
    } catch (error) {
      return `${rel} doesn't compile: ${error instanceof SceneCompileError ? error.message : String(error)}`;
    }
  };

  /** Put the shots whose components work on the timeline (the rest follow as they're built). */
  const placeScenes = async (shots: Plan["shots"], entries: ShotEntry[], ready: (component: string) => boolean) => {
    const byShot = new Map(entries.map((e) => [e.shot, e]));
    await updateTimeline(
      ctx.projectId,
      (t0) => {
        let t: Timeline = t0;
        let track = t.tracks.find((tr) => tr.role === "scenes");
        if (!track) ({ timeline: t, track } = addTrack(t, "scenes"));
        if (track.locked) t = { ...t, tracks: t.tracks.map((tr) => (tr.id === track!.id ? { ...tr, locked: false } : tr)) };
        t = { ...t, clips: t.clips.filter((c) => !(c.trackId === track!.id && c.kind === "scene" && c.meta.source === "agent")) };
        for (const [i, s] of shots.entries()) {
          const entry = byShot.get(s.id);
          if (!entry || !ready(entry.component)) continue;
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

  try {
    // ---- 1. Understanding the story ------------------------------------------
    let { plan, problems } = await readPlan();
    const planHash = await hashFile(file("plan/scene_plan.json"));
    if (plan && !problems.length) {
      // A complete plan is on disk — keep it (also when an earlier run died just after writing it).
      if (p.plan.status === "done" && planHash !== p.plan.hash) {
        // The plan was edited since: what was built from it must be checked again.
        p.build = { status: "todo", sessionId: p.build.sessionId, components: p.build.components };
        p.build.manifestHash = undefined;
        p.review = { status: "todo" };
        p.sound = { status: "todo", made: {} };
      }
      p.plan = { status: "done", hash: planHash ?? undefined, sessionId: p.plan.sessionId };
      await save();
    } else {
      report(0.03, "Understanding the story");
      p.plan.status = "running";
      await save();
      const resuming = Boolean(p.plan.sessionId);
      const planPrompt = resuming
        ? "You were interrupted while writing plan/scene_plan.json. Check what's there and finish it, following the same rules. Reply with one sentence about the story."
        : [
            "# Step 1: understand the story and plan the shots",
            "",
            "Read `input/subtitles.json` first — it is the most important file. It has every subtitle line (`cues`: index, start, end, text, tags)",
            "with exact timing in seconds, and `emotionHints` (delivery tags like serious, sad, excited) at the time they apply.",
            `The voiceover is ${voiceDuration.toFixed(2)} s long (${formatClock(voiceDuration)}). Language: ${project.language}.`,
            references.length ? `Look at these reference images — characters and places must match them:\n${references.map((r) => `- ${r}`).join("\n")}` : "There are no reference images.",
            assets.length ? `The user attached these assets you may use in scenes (import pictures from scene files):\n${assets.slice(0, 80).map((a) => `- ${a}`).join("\n")}` : "",
            notes ? `Direction from the user: ${notes}` : "",
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
      await agent("plan", planPrompt, [0.04, 0.2], {
        recap: resuming ? "You are planning a cartoon from input/subtitles.json; an earlier attempt was interrupted. Read input/subtitles.json and plan/scene_plan.json (if any) first." : undefined,
      });
      ({ plan, problems } = await readPlan());
      if (problems.length) {
        report(0.2, "Fixing the scene plan");
        await agent("plan", ["Fix these problems in plan/scene_plan.json (keep everything else):", ...problems.map((x) => `- ${x}`)].join("\n"), [0.2, 0.24], { effort: "medium" });
        ({ plan, problems } = await readPlan());
      }
      if (!plan || problems.length) throw userError(`Claude couldn't make a usable scene plan. Press Continue animating to try this step again. (${problems[0] ?? "unknown problem"})`);
      p.plan = { status: "done", hash: (await hashFile(file("plan/scene_plan.json"))) ?? undefined, sessionId: p.plan.sessionId };
      await save();
    }
    const shots = sortedShots(plan!);
    await ctx.checkCancelled();

    // ---- 2. Building the scenes ------------------------------------------------
    const buildRecap = [
      "You are building the animation for plan/scene_plan.json. An earlier conversation was interrupted.",
      "Read plan/scene_plan.json and plan/build_manifest.json, and look at the files already in scenes/ before continuing.",
    ].join(" ");
    // 2a. The manifest: which components exist and which component + props each shot uses.
    // A plan/shots.json from an older run (before manifests) becomes the manifest, so its scenes are reused.
    if (!(await exists(file("plan/build_manifest.json"))) && (await exists(file("plan/shots.json")))) {
      try {
        const legacy = z.array(ShotEntrySchema).parse(JSON.parse(await readFile(file("plan/shots.json"), "utf8")));
        const used = new Set(legacy.map((s) => s.component));
        const sceneFiles = (await listFiles(path.join(dir, "scenes"))).filter((f) => /\.(tsx|jsx|ts|js)$/.test(f)).map((f) => `scenes/${f}`);
        const role = (f: string) => (used.has(f) ? "place" : /(^|\/)kit\.\w+$/.test(f) ? "kit" : f.includes("/characters/") ? "character" : "other");
        const legacyManifest = { components: [...new Set([...sceneFiles, ...used])].map((f) => ({ path: f, role: role(f), description: "" })), shots: legacy };
        await writeFile(file("plan/build_manifest.json"), JSON.stringify(legacyManifest, null, 2), "utf8");
      } catch {
        // not usable — Claude writes a new manifest
      }
    }
    let manifestRead = await readManifest(shots);
    const manifestHash = await hashFile(file("plan/build_manifest.json"));
    const manifestOk = manifestRead.manifest && !manifestRead.problems.length;
    if (!manifestOk || !p.build.manifestHash || manifestHash !== p.build.manifestHash) {
      if (!manifestOk) {
        report(0.25, "Planning the parts to build");
        p.build.status = "running";
        await save();
        const kitExists = await exists(path.join(dir, "scenes"));
        await agent(
          "build",
          [
            "# Step 2: plan the parts of the animation (no code yet)",
            "",
            "Read `plan/scene_plan.json`. Decide which REUSABLE components the animation needs, and write `plan/build_manifest.json`:",
            "```json",
            JSON.stringify(
              {
                components: [
                  { path: "scenes/kit.tsx", role: "kit", description: "ratio-aware stage/camera, sky, light helpers" },
                  { path: "scenes/characters/Emon.tsx", role: "character", description: "Emon: props for pose, expression, mouth, blink, look, walk" },
                  { path: "scenes/InterviewRoom.tsx", role: "place", description: "the interview room; props for camera framing, who is in frame, light" },
                ],
                shots: [{ shot: "s01", component: "scenes/InterviewRoom.tsx", label: "Emon waits", props: { camera: "close", expression: "nervous" } }],
              },
              null,
              2,
            ),
            "```",
            "- One `place` component per setting/situation; each character once (role `character`); shared helpers in the `kit`.",
            "- Every shot in the plan gets one entry in `shots`, using a `place` component with props for that shot (camera, expression,",
            "  action, light…). Shots in the same place share the component.",
            kitExists ? "- Some files already exist in scenes/ — list and reuse them when they fit." : "",
            "- Write ONLY plan/build_manifest.json in this step. Reply with one sentence.",
          ]
            .filter(Boolean)
            .join("\n"),
          [0.25, 0.3],
          { recap: buildRecap },
        );
        manifestRead = await readManifest(shots);
        if (manifestRead.problems.length) {
          await agent("build", ["Fix these problems in plan/build_manifest.json:", ...manifestRead.problems.map((x) => `- ${x}`)].join("\n"), [0.3, 0.31], { effort: "medium" });
          manifestRead = await readManifest(shots);
        }
        if (!manifestRead.manifest || manifestRead.problems.length) {
          throw userError(`Claude couldn't plan the parts of the animation. Press Continue animating to try this step again. (${manifestRead.problems[0] ?? "unknown problem"})`);
        }
      }
      // New or changed manifest: components keep their state only if they're still listed.
      const listed = new Set(manifestRead.manifest!.components.map((c) => c.path));
      p.build.components = Object.fromEntries(manifestRead.manifest!.components.map((c) => [c.path, p.build.components[c.path] ?? { status: "todo" as const }]));
      for (const key of Object.keys(p.build.components)) if (!listed.has(key)) delete p.build.components[key];
      p.build.manifestHash = (await hashFile(file("plan/build_manifest.json"))) ?? undefined;
      p.build.status = "running";
      await save();
    }
    const manifest = manifestRead.manifest!;
    const components = [...manifest.components].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);

    // 2b. Each component on its own, checked right away. Already-working ones are kept.
    const isReady = (rel: string) => p.build.components[rel]?.status === "done";
    for (const c of components) {
      const state = p.build.components[c.path]!;
      if (state.status === "todo" && !(await checkComponent(c.path))) {
        // Already on disk and working (e.g. from an earlier run): keep it.
        p.build.components[c.path] = { status: "done", hash: (await hashFile(file(c.path))) ?? undefined };
        await save();
        continue;
      }
      if (state.status === "done") {
        const hash = await hashFile(file(c.path));
        if (hash && hash === state.hash) continue;
        // Changed or missing since it was built: keep it if it still works.
        if (hash && !(await checkComponent(c.path))) {
          state.hash = hash;
          p.review = { status: "todo" };
          await save();
          continue;
        }
        state.status = "todo";
      }
    }
    const total = components.length;
    const doneCount = () => components.filter((c) => isReady(c.path)).length;
    await placeScenes(shots, manifest.shots, isReady);
    for (const c of components) {
      if (isReady(c.path)) continue;
      await ctx.checkCancelled();
      const n = doneCount();
      const range: [number, number] = [0.3 + 0.38 * (n / total), 0.3 + 0.38 * ((n + 1) / total)];
      const label = `Building the scenes · ${n + 1} of ${total}: ${c.path.replace(/^scenes\//, "")}`;
      report(range[0], label);
      p.build.components[c.path] = { status: "running" };
      await save();
      const usedBy = manifest.shots.filter((s) => s.component === c.path).map((s) => s.shot);
      const done = components.filter((x) => isReady(x.path)).map((x) => x.path);
      const exists_ = await exists(file(c.path));
      await agent(
        "build",
        [
          `# Write ${c.path} now (part ${n + 1} of ${total})`,
          `What it is: ${c.description || c.role}.`,
          usedBy.length ? `Used by shots: ${usedBy.join(", ")} (see their props in plan/build_manifest.json and their timing and emotion in plan/scene_plan.json).` : "",
          done.length ? `Already finished — import and reuse them, don't rewrite them: ${done.join(", ")}.` : "",
          exists_ ? `${c.path} already exists from an interrupted attempt: check it and finish or fix it rather than starting from nothing.` : "",
          "Rules:",
          "- Make it look good and alive: depth (foreground/midground/background), soft shadows and light, gentle constant motion",
          "  (breathing, blinking, camera drift), characters that act the emotion of the line; talking characters move their mouths.",
          "- Frame for every shape (16:9, 9:16, 4:5, 1:1) with the `ratio` prop and useVideoConfig; keep faces inside the safe area and the",
          "  bottom ~15% clear for captions. Use the clip's own time (useCurrentFrame from 0) and keep animating past the shot's end.",
          "- Accept the props the manifest gives its shots, with sensible defaults (numbers, booleans, strings, #colours).",
          "- Use the reference images for character looks when there are any.",
          "- Write only this file now (and fix files you depend on only if they're broken). Do NOT edit project.json.",
          "Reply with one short sentence.",
        ]
          .filter(Boolean)
          .join("\n"),
        range,
        { recap: buildRecap },
      );
      let problem = await checkComponent(c.path);
      if (problem) {
        report(range[1], `Fixing ${c.path.replace(/^scenes\//, "")}`);
        await agent("build", `Fix this problem in ${c.path} (keep the design):\n- ${problem}`, [range[1], range[1]], { effort: "medium", recap: buildRecap });
        problem = await checkComponent(c.path);
      }
      if (problem) {
        p.build.components[c.path] = { status: "failed", error: problem };
        await save();
        throw userError(`${c.path} didn't work. Everything finished so far is kept — press Continue animating to try this part again. (${problem})`);
      }
      p.build.components[c.path] = { status: "done", hash: (await hashFile(file(c.path))) ?? undefined };
      await save();
      // Show the finished shots on the timeline straight away.
      await placeScenes(shots, manifest.shots, isReady);
    }
    // Earlier parts may import a part that changed later: check them all once more.
    const broken: string[] = [];
    for (const c of components) {
      const problem = await checkComponent(c.path);
      if (problem) broken.push(problem);
    }
    if (broken.length) {
      await agent("build", ["Fix these problems (keep the design):", ...broken.map((x) => `- ${x}`)].join("\n"), [0.68, 0.7], { effort: "medium", recap: buildRecap });
      for (const c of components) {
        const problem = await checkComponent(c.path);
        if (problem) {
          p.build.components[c.path] = { status: "failed", error: problem };
          await save();
          throw userError(`${c.path} didn't work. Everything finished so far is kept — press Continue animating to try again. (${problem})`);
        }
        p.build.components[c.path] = { status: "done", hash: (await hashFile(file(c.path))) ?? undefined };
      }
    }
    await writeFile(file("plan/shots.json"), JSON.stringify(manifest.shots, null, 2), "utf8");
    p.build.status = "done";
    await save();
    await placeScenes(shots, manifest.shots, () => true);
    await ctx.checkCancelled();

    // ---- 3. Checking its work --------------------------------------------------
    const shotsHash = sha(JSON.stringify(manifest.shots) + Object.values(p.build.components).map((c) => c.hash).join(","));
    let reviewSummary = "";
    if (!(p.review.status === "done" && p.review.shotsHash === shotsHash)) {
      report(0.7, "Rendering previews to check the shots");
      p.review = { status: "running" };
      await save();
      const checkpoint = await backupProject(ctx.projectId);
      const { timeline } = await getTimeline(ctx.projectId);
      const versions: Record<string, string> = {};
      for (const c of components) versions[c.path] = String((await stat(file(c.path))).mtimeMs);
      const props: VideoProps = { timeline, ratio: shape, fileBase: server.fileBase(ctx.projectId), sceneBase: server.sceneBase(ctx.projectId), versions, fps: timeline.fps };
      const sample = shots.length <= 24 ? shots : shots.filter((_, i) => i % Math.ceil(shots.length / 24) === 0);
      await mkdir(path.join(dir, "previews"), { recursive: true });
      const stills = await renderStills({
        props,
        stills: sample.map((s) => ({ frame: Math.round(((s.start + s.end) / 2) * timeline.fps), outputPath: path.join(dir, "previews", `${s.id}.png`) })),
        scale: 0.5,
        onStill: (done, count) => report(0.7 + 0.06 * (done / count), `Rendering previews (${done} of ${count})`),
      });
      const rendered = stills.filter((s) => !s.error);
      const failedStills = stills.filter((s) => s.error).map((s) => `${path.basename(s.outputPath, ".png")}: ${s.error}`);
      report(0.77, "Claude is checking the previews");
      const review = await agent(
        "build",
        [
          "# Check your work",
          `The app rendered one still from the middle of these shots (shape ${shape}). Look at each image and compare it with the plan:`,
          ...rendered.map((s) => `- previews/${path.basename(s.outputPath)} → shot ${path.basename(s.outputPath, ".png")}`),
          failedStills.length ? `These shots failed to render — fix them:\n${failedStills.map((b) => `- ${b}`).join("\n")}` : "",
          "Fix real problems in the scene files or in plan/build_manifest.json props: characters cut off by the frame edge, faces hidden,",
          "wrong pose or emotion, empty or broken frames, unreadable or mirrored text, too dark or too bright, ugly overlaps.",
          "Don't change what already looks right. Do NOT edit project.json — the app places the clips.",
          "Finish with one or two plain sentences for the user about the animation.",
        ]
          .filter(Boolean)
          .join("\n"),
        [0.78, 0.86],
        { effort: "medium", recap: buildRecap },
      );
      reviewSummary = review.summary;
      // Keep the review's fixes only if everything still works.
      const after = await readManifest(shots);
      const stillBroken = after.manifest && !after.problems.length ? (await Promise.all(after.manifest.components.map((c) => checkComponent(c.path)))).filter(Boolean) : ["manifest"];
      if (after.manifest && !stillBroken.length) {
        await writeFile(file("plan/shots.json"), JSON.stringify(after.manifest.shots, null, 2), "utf8");
        for (const c of after.manifest.components) p.build.components[c.path] = { status: "done", hash: (await hashFile(file(c.path))) ?? undefined };
        p.build.manifestHash = (await hashFile(file("plan/build_manifest.json"))) ?? undefined;
        await placeScenes(shots, after.manifest.shots, () => true);
      } else {
        await restoreProjectBackup(ctx.projectId, checkpoint);
      }
      const finalShots = after.manifest && !stillBroken.length ? after.manifest.shots : manifest.shots;
      p.review = { status: "done", shotsHash: sha(JSON.stringify(finalShots) + Object.values(p.build.components).map((c) => c.hash).join(",")) };
      await save();
    }
    await ctx.checkCancelled();

    // ---- 4. Sound effects and music ----------------------------------------------
    report(0.87, sounds ? "Creating sound effects and music with ElevenLabs" : "Creating sound effects and music");
    p.sound.status = "running";
    await save();
    await mkdir(path.join(dir, "audio", "sfx"), { recursive: true });
    await mkdir(path.join(dir, "audio", "music"), { recursive: true });
    const notesOut: string[] = [];
    const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "sound";
    const planned: Array<{ key: string; kind: "sfx" | "music"; at: number; length: number; volume: number; prompt: string; label: string; make: () => Promise<string | null> }> = [];

    plan!.sfx
      .filter((s) => s.at < voiceDuration)
      .slice(0, 40)
      .forEach((s, i) => {
        const key = `sfx:${sha(`${s.at}|${s.prompt}|${s.duration}`)}`;
        planned.push({
          key,
          kind: "sfx",
          at: s.at,
          length: s.duration,
          volume: Math.min(0.5, s.volume),
          prompt: s.prompt,
          label: s.prompt.slice(0, 40),
          make: async () => {
            if (sounds) {
              try {
                const rel = `audio/sfx/${String(i + 1).padStart(2, "0")}-${slug(s.prompt)}.mp3`;
                await writeFile(file(rel), await sounds.soundEffect(s.prompt, s.duration));
                return rel;
              } catch (error) {
                if (!notesOut.length) notesOut.push(`Some sound effects couldn't be made with ElevenLabs (${error instanceof Error ? error.message : "error"}).`);
              }
            }
            if (!s.preset) return null;
            const rel = `audio/sfx/${String(i + 1).padStart(2, "0")}-${s.preset}.wav`;
            await writeFile(file(rel), encodeWav(synthEffect(s.preset as SynthPreset, s.duration, i + 1)));
            return rel;
          },
        });
      });
    plan!.music
      .filter((m) => m.end > m.start)
      .slice(0, 8)
      .forEach((m, i) => {
        const length = Math.min(m.end, voiceDuration) - m.start;
        if (length < 2) return;
        planned.push({
          key: `music:${sha(`${m.start}|${m.end}|${m.mood}|${m.prompt}`)}`,
          kind: "music",
          at: m.start,
          length,
          volume: 0.5,
          prompt: m.prompt,
          label: `Music · ${m.mood}`,
          make: async () => {
            if (sounds) {
              try {
                const rel = `audio/music/${String(i + 1).padStart(2, "0")}-${m.mood}.mp3`;
                await writeFile(file(rel), await sounds.music(m.prompt || `${m.mood} instrumental background music for a cartoon`, length));
                return rel;
              } catch (error) {
                notesOut.push(`Music was made by the app instead of ElevenLabs (${error instanceof Error ? error.message : "error"}).`);
              }
            }
            const rel = `audio/music/${String(i + 1).padStart(2, "0")}-${m.mood}.wav`;
            await writeFile(file(rel), encodeWav(synthMusic(m.mood as MusicMood, length)));
            return rel;
          },
        });
      });

    for (const [i, item] of planned.entries()) {
      const madeBefore = p.sound.made[item.key];
      if (madeBefore && (await exists(file(madeBefore.path)))) continue; // never pay twice
      await ctx.checkCancelled();
      report(0.87 + 0.1 * (i / Math.max(1, planned.length)), `${item.kind === "sfx" ? "Sound effect" : "Music"} ${i + 1} of ${planned.length}: ${item.label}`);
      const rel = await item.make();
      if (rel) {
        p.sound.made[item.key] = { path: rel, kind: item.kind };
        await save();
      }
    }

    const made: Array<(typeof planned)[number] & { path: string }> = [];
    for (const item of planned) {
      const rec = p.sound.made[item.key];
      if (!rec || !(await exists(file(rec.path)))) continue;
      let length = item.length;
      try {
        const info = await probeMedia(file(rec.path));
        if (info.durationSeconds) length = item.kind === "music" ? Math.min(item.length, info.durationSeconds) : info.durationSeconds;
      } catch {
        // keep the planned length
      }
      made.push({ ...item, path: rec.path, length });
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
    p.sound.status = "done";
    p.summary = [plan!.story, reviewSummary].filter(Boolean).join("\n\n");
    await save();

    await touchProject(ctx.projectId, "Animated by Claude");
    return {
      summary: `${shots.length} shots, ${made.filter((m) => m.kind === "sfx").length} sound effects and ${made.filter((m) => m.kind === "music").length} music parts.\n\n${p.summary}`.trim(),
      shots: shots.length,
      backup: p.backup,
      notes: notesOut,
    };
  } catch (error) {
    // Nothing is rolled back: every finished step stays on disk and on the
    // timeline, and "Continue animating" picks up from here.
    p.agentPid = null;
    await save().catch(() => {});
    void latest;
    if (error instanceof AgentCancelledError) throw new JobCancelledError();
    throw error;
  }
}
