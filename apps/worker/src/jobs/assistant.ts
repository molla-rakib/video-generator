import { z } from "zod";
import {
  addChatMessage,
  enqueue,
  getProject,
  getScript,
  getTimeline,
  listChatMessages,
  listMediaAssets,
  listRecentJobs,
  updateScript,
  updateTimeline,
  type JobInput,
} from "@studio/database";
import { getBrain, getImageGenerator, type AgentTool } from "@studio/providers";
import { languageLabel } from "@studio/shared";
import {
  addClip,
  addTrack,
  clipEnd,
  ensureTrack,
  insertTime,
  MOTIONS,
  moveClip,
  newSceneId,
  sceneRanges,
  setClipDuration,
  timelineDuration,
  TRANSITIONS,
  updateClip,
} from "@studio/timeline";
import type { JobContext } from "../context";
import { storySystemPrompt } from "../prompts";

const r1 = (n: number) => Math.round(n * 10) / 10;

function tool<I>(t: AgentTool<I>): AgentTool<never> {
  return t as unknown as AgentTool<never>;
}

/** The actions the assistant can actually perform. */
function buildTools(projectId: string): AgentTool<never>[] {
  const SceneInput = z.object({
    title: z.string(),
    narration: z.string().describe("Narration text in the project language, ready to be spoken."),
    visualDirection: z.string().describe("What the viewer sees, in English."),
    mood: z.string(),
    estimatedSeconds: z.number(),
  });

  return [
    tool({
      name: "get_project_state",
      description: "Read the current script (scenes, narration, visual plans), the timeline (tracks, clips, length), media files and running tasks. Call this first when you need context.",
      input: z.object({}),
      async run() {
        const [project, { script }, { timeline }, media, jobs] = await Promise.all([
          getProject(projectId),
          getScript(projectId),
          getTimeline(projectId),
          listMediaAssets({ projectId, limit: 80 }),
          listRecentJobs(projectId),
        ]);
        const ranges = sceneRanges(timeline);
        return {
          summary: "Read the project",
          result: {
            project: { title: project.title, language: project.language, aspectRatio: project.aspectRatio, style: project.visualStyle, topic: project.topic },
            script: {
              title: script.title,
              approved: Boolean(script.approvedAt),
              scenes: script.scenes.map((s) => ({
                id: s.id,
                title: s.title,
                narration: s.narration,
                visualDirection: s.visualDirection,
                hasVoice: Boolean(s.narrationAssetId),
                timeline: ranges.get(s.id) ? { start: r1(ranges.get(s.id)!.start), end: r1(ranges.get(s.id)!.end) } : null,
                shots: s.shots.map((sh) => ({ id: sh.id, description: sh.description, duration: r1(sh.duration), hasPicture: Boolean(sh.assetId) })),
              })),
            },
            timeline: {
              durationSeconds: r1(timelineDuration(timeline)),
              audioLocked: Boolean(timeline.audioLockedAt),
              tracks: timeline.tracks.map((t) => ({
                id: t.id,
                kind: t.kind,
                name: t.name,
                muted: t.muted,
                hidden: t.hidden,
                clips: timeline.clips
                  .filter((c) => c.trackId === t.id)
                  .sort((a, b) => a.start - b.start)
                  .map((c) => ({ id: c.id, kind: c.kind, label: c.label || c.text.slice(0, 30), start: r1(c.start), duration: r1(c.duration), sceneId: c.sceneId, volume: c.volume })),
              })),
            },
            media: media.map((m) => ({ id: m.id, kind: m.kind, role: m.role, name: m.name, status: m.status, duration: m.durationSeconds ? r1(m.durationSeconds) : null })),
            runningTasks: jobs.filter((j) => j.status === "pending" || j.status === "running").map((j) => ({ title: j.title, progress: j.progress })),
          },
        };
      },
    }),

    tool({
      name: "write_script",
      description:
        "Replace the whole documentary script with new scenes you have written (story development). Use this for 'write a documentary about…' requests. Narration must be in the project language.",
      input: z.object({ title: z.string(), logline: z.string(), scenes: z.array(SceneInput).min(1) }),
      async run(input) {
        const scenes = input.scenes.map((s) => ({
          id: newSceneId(),
          title: s.title,
          narration: s.narration,
          visualDirection: s.visualDirection,
          mood: s.mood,
          estimatedDuration: Math.max(5, Math.round(s.estimatedSeconds)),
          narrationAssetId: null,
          shots: [],
        }));
        await updateScript(projectId, (s) => ({ ...s, title: input.title, logline: input.logline, scenes, approvedAt: null }));
        return { summary: `Wrote a ${scenes.length}-scene script`, result: { sceneIds: scenes.map((s) => s.id) } };
      },
    }),

    tool({
      name: "update_scene",
      description: "Edit one scene: rewrite its narration (e.g. make it more emotional), title, visual direction or mood.",
      input: z.object({
        sceneId: z.string(),
        title: z.string().optional(),
        narration: z.string().optional(),
        visualDirection: z.string().optional(),
        mood: z.string().optional(),
      }),
      async run(input) {
        let found = false;
        await updateScript(projectId, (s) => ({
          ...s,
          scenes: s.scenes.map((sc) => {
            if (sc.id !== input.sceneId) return sc;
            found = true;
            return {
              ...sc,
              title: input.title ?? sc.title,
              narration: input.narration ?? sc.narration,
              visualDirection: input.visualDirection ?? sc.visualDirection,
              mood: input.mood ?? sc.mood,
            };
          }),
        }));
        if (!found) throw new Error(`No scene with id ${input.sceneId}`);
        return { summary: "Updated a scene", result: { ok: true, note: input.narration ? "Narration text changed — regenerate the voice-over for this scene to hear it." : undefined } };
      },
    }),

    tool({
      name: "add_scene",
      description: "Insert a new scene after another scene (or at the end).",
      input: SceneInput.extend({ afterSceneId: z.string().optional() }),
      async run(input) {
        const scene = {
          id: newSceneId(),
          title: input.title,
          narration: input.narration,
          visualDirection: input.visualDirection,
          mood: input.mood,
          estimatedDuration: Math.max(5, Math.round(input.estimatedSeconds)),
          narrationAssetId: null,
          shots: [],
        };
        await updateScript(projectId, (s) => {
          const i = input.afterSceneId ? s.scenes.findIndex((x) => x.id === input.afterSceneId) : -1;
          const scenes = [...s.scenes];
          scenes.splice(i === -1 ? scenes.length : i + 1, 0, scene);
          return { ...s, scenes };
        });
        return { summary: `Added scene “${input.title}”`, result: { sceneId: scene.id } };
      },
    }),

    tool({
      name: "generate_voiceover",
      description: "Start generating narration audio for scenes (all scenes when sceneIds is empty) with the connected voice engine. Runs in the background; it places the audio on the narration track when done.",
      input: z.object({ sceneIds: z.array(z.string()).default([]) }),
      async run(input) {
        const job = await enqueue("voice.generate", projectId, input);
        return { summary: "Started Bangla voice-over", result: { taskId: job.id, status: "started in background" } };
      },
    }),

    tool({
      name: "generate_subtitles",
      description: "Start transcribing the narration with Whisper and placing timed subtitles. Runs in the background.",
      input: z.object({}),
      async run() {
        const job = await enqueue("subtitles.generate", projectId, {});
        return { summary: "Started subtitles", result: { taskId: job.id, status: "started in background" } };
      },
    }),

    tool({
      name: "plan_visuals",
      description:
        "Start the Visual Planning Agent for scenes (all when empty): creates a shot list timed to the narration, then generates pictures if an image generator is connected. Runs in the background.",
      input: z.object({ sceneIds: z.array(z.string()).default([]), generateImages: z.boolean().default(true) }),
      async run(input) {
        const job = await enqueue("storyboard.plan", projectId, input);
        return { summary: "Started visual planning", result: { taskId: job.id, status: "started in background" } };
      },
    }),

    tool({
      name: "generate_images",
      description: "Start generating pictures for planned shots that have none yet (optionally only some scenes or shots). Requires an image generator.",
      input: z.object({ sceneIds: z.array(z.string()).default([]), shotIds: z.array(z.string()).default([]) }),
      async run(input) {
        await getImageGenerator(); // explains clearly if not connected
        const job = await enqueue("images.generate", projectId, input);
        return { summary: "Started picture generation", result: { taskId: job.id, status: "started in background" } };
      },
    }),

    tool({
      name: "add_media_to_timeline",
      description:
        "Place an existing media file (from get_project_state.media) on the timeline. For background music use trackRole 'music' with volume around 0.2–0.3 and fades. Omit start to append; omit duration to use the whole file (images default to 5 s).",
      input: z.object({
        assetId: z.string(),
        trackRole: z.enum(["narration", "music", "sfx", "ambience", "video"]).optional(),
        start: z.number().min(0).optional(),
        duration: z.number().positive().optional(),
        volume: z.number().min(0).max(2).optional(),
        fadeIn: z.number().min(0).optional(),
        fadeOut: z.number().min(0).optional(),
        loopToEnd: z.boolean().optional().describe("For music: repeat the file until the end of the documentary."),
      }),
      async run(input) {
        const [asset] = await listMediaAssets({ projectId, ids: [input.assetId] });
        if (!asset || asset.status !== "ready") throw new Error("That file doesn't exist or isn't ready yet.");
        if (asset.kind === "render") throw new Error("Rendered videos can't be placed on the timeline.");
        let placed = 0;
        await updateTimeline(
          projectId,
          (t) => {
            const isVisual = asset.kind === "image" || asset.kind === "video";
            const role = isVisual ? undefined : ((input.trackRole === "video" ? "music" : input.trackRole) ?? (asset.role === "narration" ? "narration" : "music"));
            const ensured = isVisual ? ensureTrack(t, "video") : ensureTrack(t, "audio", role, role ? role[0]!.toUpperCase() + role.slice(1) : undefined);
            let next = ensured.timeline;
            const trackId = isVisual ? next.tracks.filter((tr) => tr.kind === "video").at(-1)!.id : ensured.track.id;
            const sourceDuration = asset.kind === "image" ? null : asset.durationSeconds;
            const total = timelineDuration(next);
            let start = input.start ?? (isVisual ? total : 0);
            const want = input.duration ?? (asset.kind === "image" ? 5 : (sourceDuration ?? 5));
            const until = input.loopToEnd ? Math.max(total, start + want) : start + want;
            do {
              const length = Math.min(sourceDuration ?? want, until - start, want);
              if (length < 0.2) break;
              const { timeline, clip } = addClip(next, {
                trackId,
                kind: asset.kind === "image" ? "image" : asset.kind === "video" ? "video" : "audio",
                assetId: asset.id,
                label: asset.name,
                start,
                duration: length,
                sourceDuration,
                volume: input.volume ?? (role === "music" ? 0.25 : 1),
                fadeIn: input.fadeIn ?? (role === "music" ? 2 : 0),
                fadeOut: input.fadeOut ?? (role === "music" ? 3 : 0),
                motion: asset.kind === "image" ? "zoom_in" : "none",
              });
              next = timeline;
              start = clipEnd(clip);
              placed++;
            } while (input.loopToEnd && start < until - 0.2 && placed < 50);
            return next;
          },
          "assistant",
        );
        return { summary: `Placed “${asset.name}” on the timeline`, result: { clipsAdded: placed } };
      },
    }),

    tool({
      name: "edit_clip",
      description: "Change a timeline clip: move it, change its length, volume, fades, camera motion, transition, or subtitle/title text.",
      input: z.object({
        clipId: z.string(),
        start: z.number().min(0).optional(),
        duration: z.number().positive().optional(),
        volume: z.number().min(0).max(2).optional(),
        fadeIn: z.number().min(0).optional(),
        fadeOut: z.number().min(0).optional(),
        motion: z.enum(MOTIONS).optional(),
        transition: z.enum(TRANSITIONS).optional(),
        text: z.string().optional(),
      }),
      async run(input) {
        await updateTimeline(
          projectId,
          (t) => {
            let next = t;
            if (input.start !== undefined) next = moveClip(next, input.clipId, { start: input.start });
            if (input.duration !== undefined) next = setClipDuration(next, input.clipId, input.duration);
            const { clipId: _c, start: _s, duration: _d, ...props } = input;
            void _c;
            void _s;
            void _d;
            return Object.keys(props).length ? updateClip(next, input.clipId, props) : next;
          },
          "assistant",
        );
        return { summary: "Edited a clip", result: { ok: true } };
      },
    }),

    tool({
      name: "extend_scene",
      description:
        "Make a scene longer by adding seconds at its end: later clips move to make room and the scene's last picture is stretched to fill the space (a pause after the narration).",
      input: z.object({ sceneId: z.string(), seconds: z.number().positive().max(60) }),
      async run(input) {
        await updateTimeline(
          projectId,
          (t) => {
            const range = sceneRanges(t).get(input.sceneId);
            const sceneClips = t.clips.filter((c) => c.sceneId === input.sceneId);
            const end = range?.end ?? Math.max(0, ...sceneClips.map(clipEnd));
            if (end === 0) throw new Error("That scene isn't on the timeline yet.");
            let next = insertTime(t, end, input.seconds);
            const lastVisual = next.clips
              .filter((c) => c.sceneId === input.sceneId && (c.kind === "image" || c.kind === "video"))
              .sort((a, b) => clipEnd(b) - clipEnd(a))[0];
            if (lastVisual) next = setClipDuration(next, lastVisual.id, lastVisual.duration + input.seconds);
            return next;
          },
          "assistant",
        );
        return { summary: `Extended the scene by ${input.seconds} s`, result: { ok: true } };
      },
    }),

    tool({
      name: "add_title",
      description: "Add on-screen title text (e.g. the film title, a date or place) at a time position.",
      input: z.object({ text: z.string().min(1), start: z.number().min(0), duration: z.number().positive().default(4) }),
      async run(input) {
        await updateTimeline(
          projectId,
          (t) => {
            let next = t;
            let track = next.tracks.find((tr) => tr.kind === "text" && tr.name === "Titles");
            if (!track) ({ timeline: next, track } = addTrack(next, "text", { name: "Titles" }));
            return addClip(next, { trackId: track.id, kind: "title", text: input.text, label: input.text.slice(0, 40), start: input.start, duration: input.duration }).timeline;
          },
          "assistant",
        );
        return { summary: `Added title “${input.text.slice(0, 30)}”`, result: { ok: true } };
      },
    }),

    tool({
      name: "render_video",
      description: "Start rendering the final documentary video file. Only do this when the user asks to export/render.",
      input: z.object({ resolution: z.enum(["1080p", "720p"]).default("1080p"), format: z.enum(["mp4", "webm"]).default("mp4") }),
      async run(input) {
        const job = await enqueue("render", projectId, input);
        return { summary: `Started rendering (${input.resolution} ${input.format})`, result: { taskId: job.id, status: "started in background" } };
      },
    }),
  ];
}

export async function runAssistantTurn(ctx: JobContext, input: JobInput<"assistant.turn">): Promise<Record<string, unknown>> {
  const project = await getProject(ctx.projectId);
  const brain = await getBrain();
  await ctx.progress(0.05, `${brain.label} is thinking`);
  const history = (await listChatMessages(ctx.projectId, 30))
    .filter((m) => m.id !== input.messageId && m.text.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, text: m.text }));
  const system = [
    "You are the AI Production Assistant inside Documentary Studio, a documentary editor for non-technical people.",
    `The project: "${project.title}". Narration language: ${languageLabel(project.language)}. Visual style: ${project.visualStyle}. Format: ${project.aspectRatio}.`,
    "You can ACT through your tools — do the work instead of describing it. Read the project state first when you need ids or context.",
    "Workflow: script → voice-over → subtitles → visual plan and pictures → arrange → render. Voice, subtitles, pictures and render run as background tasks; say they have started and that progress shows in the editor.",
    "Never claim something finished if you only started it. If a tool fails, explain the problem simply and suggest the fix (e.g. connect a provider in Settings, or upload a file).",
    "There is no music generator connected: for background music, use an uploaded music file (role music) or ask the user to upload one.",
    "Reply in the language the user writes in (Bangla or English). Keep replies short and friendly; no technical jargon, no JSON.",
    "",
    "When writing or rewriting narration, follow these rules:",
    storySystemPrompt(project.language),
  ].join("\n");

  const result = await brain.runAgent({
    system,
    history,
    message: input.text,
    tools: buildTools(ctx.projectId),
    maxSteps: 14,
    onAction: async (a) => {
      await ctx.progress(0.5, a.summary);
    },
    shouldStop: () => ctx.cancelled(),
  });
  await addChatMessage({
    projectId: ctx.projectId,
    role: "assistant",
    text: result.text || (result.actions.length ? "Done." : "I couldn't find anything to do for that request."),
    actions: result.actions,
    jobId: ctx.job.id,
  });
  return { actions: result.actions.length };
}
