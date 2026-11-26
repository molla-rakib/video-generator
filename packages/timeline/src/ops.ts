import {
  ClipSchema,
  TimelineSchema,
  TRACK_FOR_CLIP,
  clipEnd,
  isAudioTrackLocked,
  newId,
  type AudioRole,
  type Clip,
  type ClipInput,
  type Marker,
  type Timeline,
  type Track,
  type TrackKind,
} from "./editor";
import { roundTime } from "./time";

/**
 * Pure editing operations. Each returns a NEW timeline (inputs are never
 * mutated), which makes undo/redo a matter of keeping old values, and lets
 * the editor UI, the AI agents and the tests share exactly the same rules.
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
  if (isAudioTrackLocked(t, track)) {
    throw new TimelineOpError(
      track.kind === "audio" && t.audioLockedAt
        ? "The audio is locked. Unlock it to make changes."
        : `The track "${track.name}" is locked.`,
    );
  }
}

function assertCompatible(track: Track, clip: Pick<Clip, "kind">): void {
  if (TRACK_FOR_CLIP[clip.kind] !== track.kind) {
    const what = { video: "a video track", audio: "an audio track", text: "the subtitle/text track" }[TRACK_FOR_CLIP[clip.kind]];
    throw new TimelineOpError(`This clip belongs on ${what}.`);
  }
}

function replaceClip(t: Timeline, clip: Clip): Timeline {
  return { ...t, clips: t.clips.map((c) => (c.id === clip.id ? clip : c)) };
}

/** Gaps on a track (excluding one clip), as [start, end) intervals. */
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
  "volume",
  "fadeIn",
  "fadeOut",
  "transition",
  "transitionDuration",
  "motion",
  "motionStrength",
  "fit",
  "text",
  "sceneId",
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

/** Set an exact duration (keeps the start). Media clips are capped at the source length. */
export function setClipDuration(t: Timeline, clipId: string, duration: number): Timeline {
  const clip = getClip(t, clipId);
  return trimClipEnd(t, clipId, clip.start + duration);
}

/**
 * Open up `seconds` of time at `at`: every clip and marker starting at or
 * after `at` moves later. Locked tracks are respected (their clips stay).
 */
export function insertTime(t: Timeline, at: number, seconds: number): Timeline {
  if (seconds <= 0) return t;
  const lockedTracks = new Set(t.tracks.filter((tr) => isAudioTrackLocked(t, tr)).map((tr) => tr.id));
  return {
    ...t,
    clips: t.clips.map((c) => (c.start >= at - 1e-6 && !lockedTracks.has(c.trackId) ? { ...c, start: r(c.start + seconds) } : c)),
    markers: t.markers.map((m) => (m.time >= at - 1e-6 ? { ...m, time: r(m.time + seconds) } : m)),
  };
}

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

export function updateTrack(
  t: Timeline,
  trackId: string,
  patch: Partial<Pick<Track, "name" | "muted" | "hidden" | "locked">>,
): Timeline {
  getTrack(t, trackId);
  return { ...t, tracks: t.tracks.map((tr) => (tr.id === trackId ? { ...tr, ...patch } : tr)) };
}

/** Add a track: video tracks go above existing video tracks, audio below audio. */
export function addTrack(t: Timeline, kind: TrackKind, options: { name?: string; role?: AudioRole } = {}): { timeline: Timeline; track: Track } {
  const count = t.tracks.filter((tr) => tr.kind === kind).length;
  const track: Track = {
    id: newId(kind === "video" ? "v" : kind === "audio" ? "a" : "t"),
    kind,
    name: options.name ?? `${kind === "video" ? "Video" : kind === "audio" ? "Audio" : "Text"} ${count + 1}`,
    role: kind === "audio" ? (options.role ?? null) : null,
    muted: false,
    hidden: false,
    locked: false,
  };
  const tracks = [...t.tracks];
  if (kind === "video") {
    const firstVideo = tracks.findIndex((tr) => tr.kind === "video");
    tracks.splice(firstVideo === -1 ? tracks.length : firstVideo, 0, track);
  } else if (kind === "audio") {
    let lastAudio = -1;
    tracks.forEach((tr, i) => {
      if (tr.kind === "audio") lastAudio = i;
    });
    tracks.splice(lastAudio === -1 ? tracks.length : lastAudio + 1, 0, track);
  } else {
    tracks.unshift(track);
  }
  return { timeline: { ...t, tracks }, track };
}

export function removeTrack(t: Timeline, trackId: string): Timeline {
  getTrack(t, trackId);
  if (t.clips.some((c) => c.trackId === trackId)) throw new TimelineOpError("Remove the clips on this track first.");
  if (t.tracks.length <= 1) throw new TimelineOpError("A documentary needs at least one track.");
  return { ...t, tracks: t.tracks.filter((tr) => tr.id !== trackId) };
}

/**
 * Where a new clip of this kind should go by default: pictures/video on the
 * main (bottom) picture lane, audio on the track for its role, text on the
 * first text track. Locked tracks are skipped.
 */
export function defaultTrackFor(t: Timeline, clipKind: Clip["kind"], role?: string | null): Track | undefined {
  const want = TRACK_FOR_CLIP[clipKind];
  const tracks = t.tracks.filter((tr) => tr.kind === want && !isAudioTrackLocked(t, tr));
  if (want === "video") return tracks.at(-1);
  if (want === "audio") return (role ? tracks.find((tr) => tr.role === role) : undefined) ?? tracks[0];
  return tracks[0];
}

/** First track of a kind (optionally with a role), creating one if missing. */
export function ensureTrack(t: Timeline, kind: TrackKind, role?: AudioRole, name?: string): { timeline: Timeline; track: Track } {
  const existing = t.tracks.find((tr) => tr.kind === kind && (role === undefined || tr.role === role));
  if (existing) return { timeline: t, track: existing };
  return addTrack(t, kind, { role, name });
}

// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------

export function addMarker(t: Timeline, marker: Omit<Marker, "id"> & { id?: string }): Timeline {
  const m: Marker = { id: marker.id ?? newId("mk"), time: r(Math.max(0, marker.time)), label: marker.label, sceneId: marker.sceneId ?? null };
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
  return TimelineSchema.parse(t);
}
