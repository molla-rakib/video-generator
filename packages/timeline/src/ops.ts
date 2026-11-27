import type { AspectRatio } from "@studio/shared";
import {
  BoxSchema,
  ClipSchema,
  ProjectDocSchema,
  ROLE_KIND,
  TRACK_FOR_CLIP,
  clipEnd,
  isTrackLocked,
  newId,
  type Box,
  type Clip,
  type ClipInput,
  type Marker,
  type Timeline,
  type Track,
  type TrackRole,
} from "./editor";
import { roundTime } from "./time";

/**
 * Pure editing operations. Each returns a NEW timeline (inputs are never
 * mutated), which makes undo/redo a matter of keeping old values, and lets
 * the editor UI, the AI agent bridge and the tests share exactly the same rules.
 */

export const MIN_CLIP_DURATION = 0.1;

export class TimelineOpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimelineOpError";
  }
}

const r = roundTime;

function getClip(t: Timeline, id: string): Clip {
  const clip = t.clips.find((c) => c.id === id);
  if (!clip) throw new TimelineOpError("That clip no longer exists.");
  return clip;
}

function getTrack(t: Timeline, id: string): Track {
  const track = t.tracks.find((tr) => tr.id === id);
  if (!track) throw new TimelineOpError("That track no longer exists.");
  return track;
}

function assertEditable(t: Timeline, track: Track): void {
  if (isTrackLocked(t, track)) throw new TimelineOpError(`The track "${track.name}" is locked. Unlock it to make changes.`);
}

function assertCompatible(track: Track, clip: Pick<Clip, "kind">): void {
  if (TRACK_FOR_CLIP[clip.kind] !== track.kind) {
    const what = { video: "a scene or overlay track", audio: "an audio track", text: "a caption or title track" }[TRACK_FOR_CLIP[clip.kind]];
    throw new TimelineOpError(`This clip belongs on ${what}.`);
  }
}

function replaceClip(t: Timeline, clip: Clip): Timeline {
  return { ...t, clips: t.clips.map((c) => (c.id === clip.id ? clip : c)) };
}

/** Busy intervals on a track (excluding one clip), as [start, end). */
function occupied(t: Timeline, trackId: string, excludeId?: string): Array<[number, number]> {
  return t.clips
    .filter((c) => c.trackId === trackId && c.id !== excludeId)
    .map((c) => [c.start, clipEnd(c)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}

/**
 * Nearest start position at or around `desired` where a clip of `duration`
 * fits on the track without overlapping others.
 */
export function findFreeStart(t: Timeline, trackId: string, desired: number, duration: number, excludeId?: string): number {
  const busy = occupied(t, trackId, excludeId);
  const fits = (s: number) => s >= 0 && busy.every(([a, b]) => s + duration <= a + 1e-6 || s >= b - 1e-6);
  const start = Math.max(0, desired);
  if (fits(start)) return r(start);
  // Candidates: right after each clip, or right before each clip.
  const candidates = new Set<number>([0]);
  for (const [a, b] of busy) {
    candidates.add(b);
    candidates.add(a - duration);
  }
  let best: number | null = null;
  for (const c of candidates) {
    if (!fits(c)) continue;
    if (best === null || Math.abs(c - start) < Math.abs(best - start)) best = c;
  }
  return r(best ?? Math.max(start, busy.length ? busy[busy.length - 1]![1] : 0));
}

// ---------------------------------------------------------------------------
// Clips
// ---------------------------------------------------------------------------

export function addClip(t: Timeline, input: Omit<ClipInput, "id"> & { id?: string }): { timeline: Timeline; clip: Clip } {
  const track = getTrack(t, input.trackId);
  const clip = ClipSchema.parse({ ...input, id: input.id ?? newId("clip") });
  assertCompatible(track, clip);
  assertEditable(t, track);
  const placed = { ...clip, start: findFreeStart(t, track.id, clip.start, clip.duration) };
  return { timeline: { ...t, clips: [...t.clips, placed] }, clip: placed };
}

/** Move a clip in time and optionally to another (compatible) track. */
export function moveClip(t: Timeline, clipId: string, to: { start: number; trackId?: string }): Timeline {
  const clip = getClip(t, clipId);
  const fromTrack = getTrack(t, clip.trackId);
  const toTrack = getTrack(t, to.trackId ?? clip.trackId);
  assertEditable(t, fromTrack);
  assertEditable(t, toTrack);
  assertCompatible(toTrack, clip);
  const start = findFreeStart(t, toTrack.id, to.start, clip.duration, clip.id);
  return replaceClip(t, { ...clip, start, trackId: toTrack.id });
}

/** Drag the left edge: changes start, duration and the source in-point. */
export function trimClipStart(t: Timeline, clipId: string, newStart: number): Timeline {
  const clip = getClip(t, clipId);
  assertEditable(t, getTrack(t, clip.trackId));
  const end = clipEnd(clip);
  const prevEnd = Math.max(0, ...occupied(t, clip.trackId, clip.id).filter(([, b]) => b <= clip.start + 1e-6).map(([, b]) => b));
  let start = Math.min(Math.max(newStart, prevEnd, 0), end - MIN_CLIP_DURATION);
  // Media can't be extended before its first frame.
  if (clip.sourceDuration !== null) start = Math.max(start, clip.start - clip.sourceStart);
  const delta = start - clip.start;
  return replaceClip(t, {
    ...clip,
    start: r(start),
    duration: r(end - start),
    sourceStart: clip.sourceDuration !== null ? r(clip.sourceStart + delta) : clip.sourceStart,
  });
}

/** Drag the right edge: changes duration only. */
export function trimClipEnd(t: Timeline, clipId: string, newEnd: number): Timeline {
  const clip = getClip(t, clipId);
  assertEditable(t, getTrack(t, clip.trackId));
  const nextStart = Math.min(
    Number.POSITIVE_INFINITY,
    ...occupied(t, clip.trackId, clip.id).filter(([a]) => a >= clipEnd(clip) - 1e-6).map(([a]) => a),
  );
  let end = Math.max(Math.min(newEnd, nextStart), clip.start + MIN_CLIP_DURATION);
  if (clip.sourceDuration !== null) end = Math.min(end, clip.start + (clip.sourceDuration - clip.sourceStart));
  return replaceClip(t, { ...clip, duration: r(end - clip.start) });
}

/** Cut a clip in two at a timeline position. */
export function splitClip(t: Timeline, clipId: string, at: number): { timeline: Timeline; rightId: string } {
  const clip = getClip(t, clipId);
  assertEditable(t, getTrack(t, clip.trackId));
  if (at <= clip.start + MIN_CLIP_DURATION || at >= clipEnd(clip) - MIN_CLIP_DURATION) {
    throw new TimelineOpError("Move the playhead inside the clip to split it.");
  }
  const leftDuration = r(at - clip.start);
  const left: Clip = { ...clip, duration: leftDuration, fadeOut: 0 };
  const right: Clip = {
    ...clip,
    id: newId("clip"),
    start: r(at),
    duration: r(clip.duration - leftDuration),
    sourceStart: clip.sourceDuration !== null ? r(clip.sourceStart + leftDuration) : clip.sourceStart,
    fadeIn: 0,
    transition: "none",
  };
  const clips = t.clips.flatMap((c) => (c.id === clip.id ? [left, right] : [c]));
  return { timeline: { ...t, clips }, rightId: right.id };
}

export function deleteClips(t: Timeline, ids: readonly string[]): Timeline {
  const set = new Set(ids);
  for (const c of t.clips) if (set.has(c.id)) assertEditable(t, getTrack(t, c.trackId));
  return { ...t, clips: t.clips.filter((c) => !set.has(c.id)) };
}

/** Copy a clip right after itself (or the next free spot). */
export function duplicateClip(t: Timeline, clipId: string): { timeline: Timeline; clip: Clip } {
  const clip = getClip(t, clipId);
  const { id: _id, ...rest } = clip;
  void _id;
  return addClip(t, { ...rest, start: clipEnd(clip) });
}

export const EDITABLE_CLIP_FIELDS = [
  "label",
  "props",
  "layout",
  "volume",
  "fadeIn",
  "fadeOut",
  "transition",
  "transitionDuration",
  "motion",
  "motionStrength",
  "fit",
  "text",
  "meta",
] as const;
export type ClipPatch = Partial<Pick<Clip, (typeof EDITABLE_CLIP_FIELDS)[number]>>;

/** Change a clip's properties (not its position — use move/trim for that). */
export function updateClip(t: Timeline, clipId: string, patch: ClipPatch): Timeline {
  const clip = getClip(t, clipId);
  assertEditable(t, getTrack(t, clip.trackId));
  const allowed: Record<string, unknown> = {};
  for (const key of EDITABLE_CLIP_FIELDS) if (patch[key] !== undefined) allowed[key] = patch[key];
  const next = ClipSchema.parse({ ...clip, ...allowed });
  // Fades can't be longer than the clip.
  next.fadeIn = Math.min(next.fadeIn, next.duration);
  next.fadeOut = Math.min(next.fadeOut, next.duration - next.fadeIn);
  return replaceClip(t, next);
}

/** Change several clips at once (e.g. turn every selected SFX down). */
export function updateClips(t: Timeline, clipIds: readonly string[], patch: ClipPatch): Timeline {
  return clipIds.reduce((acc, id) => updateClip(acc, id, patch), t);
}

/** Set an exact duration (keeps the start). Media clips are capped at the source length. */
export function setClipDuration(t: Timeline, clipId: string, duration: number): Timeline {
  const clip = getClip(t, clipId);
  return trimClipEnd(t, clipId, clip.start + duration);
}

/**
 * Swap the file a clip plays (e.g. replace a generated sound effect with
 * your own), keeping its position, volume and fades.
 */
export function replaceClipSource(t: Timeline, clipId: string, src: string, sourceDuration: number | null, label?: string): Timeline {
  const clip = getClip(t, clipId);
  assertEditable(t, getTrack(t, clip.trackId));
  if (!clip.src) throw new TimelineOpError("Only media clips can have their file replaced.");
  const duration = sourceDuration !== null ? Math.min(clip.duration, sourceDuration) : clip.duration;
  return replaceClip(t, ClipSchema.parse({ ...clip, src, sourceDuration, sourceStart: 0, duration: r(duration), label: label ?? clip.label }));
}

/**
 * Open up `seconds` of time at `at`: every clip and marker starting at or
 * after `at` moves later. Locked tracks are respected (their clips stay).
 */
export function insertTime(t: Timeline, at: number, seconds: number): Timeline {
  if (seconds <= 0) return t;
  const lockedTracks = new Set(t.tracks.filter((tr) => isTrackLocked(t, tr)).map((tr) => tr.id));
  return {
    ...t,
    clips: t.clips.map((c) => (c.start >= at - 1e-6 && !lockedTracks.has(c.trackId) ? { ...c, start: r(c.start + seconds) } : c)),
    markers: t.markers.map((m) => (m.time >= at - 1e-6 ? { ...m, time: r(m.time + seconds) } : m)),
  };
}

// ---------------------------------------------------------------------------
// Layout (picture-in-picture, per aspect ratio)
// ---------------------------------------------------------------------------

/**
 * Place a visual clip in the frame. `ratio` "default" changes the layout for
 * every shape that has no layout of its own; a specific ratio changes only
 * that shape. Pass null for full frame. Pass `undefined` with a specific
 * ratio to remove its own layout (it then follows the default again).
 */
export function setClipLayout(t: Timeline, clipId: string, ratio: AspectRatio | "default", box: Box | null | undefined): Timeline {
  const clip = getClip(t, clipId);
  assertEditable(t, getTrack(t, clip.trackId));
  if (TRACK_FOR_CLIP[clip.kind] !== "video") throw new TimelineOpError("Only pictures, video and scenes can be placed in the frame.");
  const parsed = box ? BoxSchema.parse(box) : box;
  let layout: Clip["layout"];
  if (ratio === "default") {
    layout = { ...clip.layout, default: parsed ?? null };
  } else {
    const byRatio = { ...clip.layout.byRatio };
    if (parsed === undefined) delete byRatio[ratio];
    else byRatio[ratio] = parsed;
    layout = { ...clip.layout, byRatio };
  }
  return replaceClip(t, { ...clip, layout });
}

export const PIP_POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right", "center"] as const;
export type PipPosition = (typeof PIP_POSITIONS)[number];

const FRAME_ASPECT: Record<AspectRatio, number> = { "16:9": 16 / 9, "9:16": 9 / 16, "4:5": 4 / 5, "1:1": 1 };

/**
 * A picture-in-picture box for a corner of the frame, sized so a source of
 * `sourceAspect` (width / height) keeps its shape. Vertical frames get a
 * bigger box and keep clear of the caption area.
 */
export function pipBox(position: PipPosition, ratio: AspectRatio, sourceAspect = 16 / 9, size?: number): Box {
  const frame = FRAME_ASPECT[ratio];
  const w = size ?? (frame >= 1 ? 0.3 : 0.5);
  const h = Math.min(0.9, (w * frame) / sourceAspect);
  const mx = 0.035;
  const my = mx * frame;
  const captionClearance = frame < 1 ? 0.14 : 0.04;
  const x = position.endsWith("left") ? mx : position === "center" ? (1 - w) / 2 : 1 - w - mx;
  const y = position.startsWith("top") ? my + (frame < 1 ? 0.04 : 0) : position === "center" ? (1 - h) / 2 : 1 - h - my - captionClearance;
  return { x: r(x), y: r(y), w: r(w), h: r(h), radius: 0.08 };
}

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

export function updateTrack(
  t: Timeline,
  trackId: string,
  patch: Partial<Pick<Track, "name" | "muted" | "solo" | "hidden" | "locked" | "volume">>,
): Timeline {
  getTrack(t, trackId);
  const clean = patch.volume !== undefined ? { ...patch, volume: Math.min(2, Math.max(0, patch.volume)) } : patch;
  return { ...t, tracks: t.tracks.map((tr) => (tr.id === trackId ? { ...tr, ...clean } : tr)) };
}

export const ROLE_NAMES: Record<TrackRole, string> = {
  scenes: "Scenes",
  overlay: "Overlay",
  voice: "Voice",
  music: "Music",
  sfx: "Sound effects",
  ambience: "Ambience",
  other: "Audio",
  captions: "Captions",
  titles: "Titles",
};

/**
 * Add a track. Overlays go above every video track, scene tracks just above
 * the existing scene tracks, audio below the last audio track, text on top.
 */
export function addTrack(t: Timeline, role: TrackRole, options: { name?: string } = {}): { timeline: Timeline; track: Track } {
  const kind = ROLE_KIND[role];
  const sameRole = t.tracks.filter((tr) => tr.role === role).length;
  const track: Track = {
    id: newId(kind === "video" ? "v" : kind === "audio" ? "a" : "t"),
    kind,
    role,
    name: options.name ?? (sameRole ? `${ROLE_NAMES[role]} ${sameRole + 1}` : ROLE_NAMES[role]),
    muted: false,
    solo: false,
    hidden: false,
    locked: false,
    volume: 1,
  };
  const tracks = [...t.tracks];
  const firstIndex = (pred: (tr: Track) => boolean) => tracks.findIndex(pred);
  let lastAudio = -1;
  tracks.forEach((tr, i) => {
    if (tr.kind === "audio") lastAudio = i;
  });
  let at: number;
  if (role === "overlay") at = firstIndex((tr) => tr.kind === "video");
  else if (kind === "video") at = firstIndex((tr) => tr.role === "scenes");
  else if (kind === "audio") at = lastAudio === -1 ? -1 : lastAudio + 1;
  else at = 0;
  tracks.splice(at === -1 ? tracks.length : at, 0, track);
  return { timeline: { ...t, tracks }, track };
}

export function removeTrack(t: Timeline, trackId: string): Timeline {
  getTrack(t, trackId);
  if (t.clips.some((c) => c.trackId === trackId)) throw new TimelineOpError("Remove the clips on this track first.");
  if (t.tracks.length <= 1) throw new TimelineOpError("A video needs at least one track.");
  return { ...t, tracks: t.tracks.filter((tr) => tr.id !== trackId) };
}

/**
 * Where a new clip should go by default: on an unlocked track with the
 * wanted role, otherwise the first compatible unlocked track. Your own
 * pictures and video go to the overlay lane.
 */
export function defaultTrackFor(t: Timeline, clipKind: Clip["kind"], role?: TrackRole | null): Track | undefined {
  const want = TRACK_FOR_CLIP[clipKind];
  const tracks = t.tracks.filter((tr) => tr.kind === want && !isTrackLocked(t, tr));
  const fallbackRole: TrackRole | null =
    clipKind === "scene" ? "scenes" : clipKind === "video" || clipKind === "image" ? "overlay" : clipKind === "caption" ? "captions" : clipKind === "title" ? "titles" : null;
  const preferred = role && ROLE_KIND[role] === want ? role : fallbackRole;
  return (preferred ? tracks.find((tr) => tr.role === preferred) : undefined) ?? tracks[0];
}

/** First track with a role, creating one if missing. */
export function ensureTrack(t: Timeline, role: TrackRole, name?: string): { timeline: Timeline; track: Track } {
  const existing = t.tracks.find((tr) => tr.role === role);
  if (existing) return { timeline: t, track: existing };
  return addTrack(t, role, { name });
}

/** Change the shape being edited (and make sure it is one of the export shapes). */
export function setEditingRatio(t: Timeline, ratio: AspectRatio): Timeline {
  return { ...t, ratio, ratios: t.ratios.includes(ratio) ? t.ratios : [...t.ratios, ratio] };
}

// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------

export function addMarker(t: Timeline, marker: Omit<Marker, "id"> & { id?: string }): Timeline {
  const m: Marker = { id: marker.id ?? newId("mk"), time: r(Math.max(0, marker.time)), label: marker.label };
  return { ...t, markers: [...t.markers, m].sort((a, b) => a.time - b.time) };
}

export function removeMarker(t: Timeline, markerId: string): Timeline {
  return { ...t, markers: t.markers.filter((m) => m.id !== markerId) };
}

export function moveMarker(t: Timeline, markerId: string, time: number): Timeline {
  return {
    ...t,
    markers: t.markers.map((m) => (m.id === markerId ? { ...m, time: r(Math.max(0, time)) } : m)).sort((a, b) => a.time - b.time),
  };
}

// ---------------------------------------------------------------------------
// Snapping & whole-timeline helpers
// ---------------------------------------------------------------------------

/** Snap a time to nearby clip edges, markers, the playhead or zero. */
export function snapTime(
  t: Timeline,
  time: number,
  options: { threshold: number; excludeClipId?: string; extra?: number[] },
): number {
  const points: number[] = [0, ...(options.extra ?? [])];
  for (const c of t.clips) {
    if (c.id === options.excludeClipId) continue;
    points.push(c.start, clipEnd(c));
  }
  for (const m of t.markers) points.push(m.time);
  let best = time;
  let bestDist = options.threshold;
  for (const p of points) {
    const d = Math.abs(p - time);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return r(best);
}

/** Validate after a series of operations (e.g. before saving). */
export function checkTimeline(t: unknown): Timeline {
  return ProjectDocSchema.parse(t);
}
