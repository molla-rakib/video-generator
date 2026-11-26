import { z } from "zod";
import {
  clipEnd,
  newId,
  type Clip,
  type Timeline,
} from "./editor";
import { addClip, addMarker, deleteClips, ensureTrack, findFreeStart } from "./ops";
import { roundTime } from "./time";
import { MOTIONS, TRANSITIONS } from "./editor";

/**
 * DOCUMENTARY SCRIPT
 *
 * The story side of a project: scenes with Bangla narration and visual
 * direction. Agents write it; the user edits and approves it; production
 * steps (voice, subtitles, visuals) turn it into clips on the timeline.
 */

export const ShotPlanSchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  /** English prompt for an image generator (models work best in English). */
  imagePrompt: z.string(),
  duration: z.number().finite().positive(),
  motion: z.enum(MOTIONS).default("zoom_in"),
  transition: z.enum(TRANSITIONS).default("fade"),
  /** Media asset chosen or generated for this shot. */
  assetId: z.string().nullable().default(null),
});
export type ShotPlan = z.infer<typeof ShotPlanSchema>;

export const SceneSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  /** Narration in the project language (usually Bangla). */
  narration: z.string(),
  /** What the viewer should see — direction for the visual planner. */
  visualDirection: z.string().default(""),
  mood: z.string().default(""),
  /** Rough length in seconds before the voice exists. */
  estimatedDuration: z.number().finite().positive().default(20),
  /** Voice clip generated/uploaded for this scene. */
  narrationAssetId: z.string().nullable().default(null),
  /** Visual plan made after the narration exists. */
  shots: z.array(ShotPlanSchema).default([]),
});
export type Scene = z.infer<typeof SceneSchema>;

export const ScriptSchema = z.object({
  title: z.string().default(""),
  logline: z.string().default(""),
  language: z.string().default("bn"),
  scenes: z.array(SceneSchema).default([]),
  approvedAt: z.string().nullable().default(null),
});
export type Script = z.infer<typeof ScriptSchema>;

export function emptyScript(language = "bn"): Script {
  return ScriptSchema.parse({ language });
}

export function newSceneId(): string {
  return newId("scene");
}

/** Full narration text of the script, scene by scene. */
export function scriptNarration(script: Script): string {
  return script.scenes.map((s) => s.narration.trim()).filter(Boolean).join("\n\n");
}

// ---------------------------------------------------------------------------
// Turning the script into timeline clips
// ---------------------------------------------------------------------------

export interface NarrationClipInput {
  sceneId: string;
  assetId: string;
  duration: number;
  label: string;
}

/**
 * Lay scene narration clips one after another on the narration track, with a
 * short breath between scenes, and put a scene marker at each start.
 * Existing narration clips for these scenes are replaced.
 */
export function layoutNarration(t: Timeline, items: NarrationClipInput[], options: { gap?: number } = {}): Timeline {
  const gap = options.gap ?? 0.6;
  const ensured = ensureTrack(t, "audio", "narration", "Narration");
  let timeline = ensured.timeline;
  const track = ensured.track;
  const sceneIds = new Set(items.map((i) => i.sceneId));
  timeline = deleteClips(
    timeline,
    timeline.clips.filter((c) => c.trackId === track.id && c.sceneId && sceneIds.has(c.sceneId)).map((c) => c.id),
  );
  timeline = { ...timeline, markers: timeline.markers.filter((m) => !m.sceneId || !sceneIds.has(m.sceneId)) };

  let cursor = 0;
  for (const item of items) {
    const start = findFreeStart(timeline, track.id, cursor, item.duration);
    const added = addClip(timeline, {
      trackId: track.id,
      kind: "audio",
      assetId: item.assetId,
      label: item.label,
      start,
      duration: item.duration,
      sourceDuration: item.duration,
      sceneId: item.sceneId,
    });
    timeline = addMarker(added.timeline, { time: start, label: item.label, sceneId: item.sceneId });
    cursor = clipEnd(added.clip) + gap;
  }
  return timeline;
}

/** Where each scene sits on the timeline, from its narration clip. */
export function sceneRanges(t: Timeline): Map<string, { start: number; end: number }> {
  const ranges = new Map<string, { start: number; end: number }>();
  for (const c of t.clips) {
    if (c.kind !== "audio" || !c.sceneId) continue;
    const existing = ranges.get(c.sceneId);
    ranges.set(c.sceneId, {
      start: Math.min(existing?.start ?? Number.POSITIVE_INFINITY, c.start),
      end: Math.max(existing?.end ?? 0, clipEnd(c)),
    });
  }
  return ranges;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

/**
 * Replace the subtitles of one narration clip with transcribed cues.
 * Cue times are relative to the start of the source audio.
 */
export function placeSubtitles(t: Timeline, narrationClip: Clip, cues: SubtitleCue[]): Timeline {
  const ensured = ensureTrack(t, "text", undefined, "Subtitles");
  let timeline = ensured.timeline;
  const track = ensured.track;
  const visibleFrom = narrationClip.sourceStart;
  const visibleTo = narrationClip.sourceStart + narrationClip.duration;
  // Remove previous subtitles that overlap this clip.
  timeline = deleteClips(
    timeline,
    timeline.clips
      .filter((c) => c.trackId === track.id && c.start < clipEnd(narrationClip) && clipEnd(c) > narrationClip.start)
      .map((c) => c.id),
  );
  for (const cue of cues) {
    const from = Math.max(cue.start, visibleFrom);
    const to = Math.min(cue.end, visibleTo);
    if (to - from < 0.2 || !cue.text.trim()) continue;
    const start = roundTime(narrationClip.start + (from - visibleFrom));
    timeline = addClip(timeline, {
      trackId: track.id,
      kind: "subtitle",
      text: cue.text.trim(),
      label: cue.text.trim().slice(0, 40),
      start,
      duration: roundTime(to - from),
      sceneId: narrationClip.sceneId,
    }).timeline;
  }
  return timeline;
}

/**
 * Place a scene's planned shots (that have media) on the main video track,
 * stretched proportionally to fill the scene's narration time.
 */
export function layoutSceneVisuals(
  t: Timeline,
  scene: Scene,
  assets: Map<string, { kind: "image" | "video"; duration: number | null }>,
): Timeline {
  const range = sceneRanges(t).get(scene.id);
  const shots = scene.shots.filter((s) => s.assetId && assets.has(s.assetId));
  if (shots.length === 0) return t;
  const ensured = ensureTrack(t, "video", undefined, "Video 1");
  // Prefer the bottom-most video track (the main picture lane).
  const videoTracks = ensured.timeline.tracks.filter((tr) => tr.kind === "video");
  const track = videoTracks[videoTracks.length - 1] ?? ensured.track;
  let timeline = ensured.timeline;
  timeline = deleteClips(
    timeline,
    timeline.clips.filter((c) => c.trackId === track.id && c.sceneId === scene.id).map((c) => c.id),
  );

  const plannedTotal = shots.reduce((sum, s) => sum + s.duration, 0);
  const start = range?.start ?? findFreeStart(timeline, track.id, timelineEnd(timeline), plannedTotal);
  const total = range ? range.end - range.start : plannedTotal;
  const scale = total / plannedTotal;

  let cursor = start;
  shots.forEach((shot, i) => {
    const asset = assets.get(shot.assetId!)!;
    let duration = i === shots.length - 1 ? start + total - cursor : shot.duration * scale;
    if (asset.kind === "video" && asset.duration) duration = Math.min(duration, asset.duration);
    duration = Math.max(0.5, roundTime(duration));
    timeline = addClip(timeline, {
      trackId: track.id,
      kind: asset.kind,
      assetId: shot.assetId,
      label: shot.description.slice(0, 60),
      start: roundTime(cursor),
      duration,
      sourceDuration: asset.kind === "video" ? asset.duration : null,
      motion: asset.kind === "image" ? shot.motion : "none",
      transition: i === 0 ? "fade" : shot.transition,
      sceneId: scene.id,
    }).timeline;
    cursor += duration;
  });
  return timeline;
}

function timelineEnd(t: Timeline): number {
  return t.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
}
