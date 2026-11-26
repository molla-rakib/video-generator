import { z } from "zod";

/**
 * EDITOR TIMELINE
 *
 * The single synchronized timeline shared by the editor UI, the AI agents and
 * the Remotion renderer. Everything is in SECONDS.
 *
 *   tracks  — ordered top-to-bottom as shown in the editor. For visual tracks
 *             the higher track is drawn in front (like V2 over V1).
 *   clips   — each belongs to one track and (usually) one media asset.
 *   markers — scene markers on the ruler.
 */

export const TIMELINE_SCHEMA_VERSION = 2 as const;

const Seconds = z.number().finite().nonnegative();

export const TRACK_KINDS = ["video", "audio", "text"] as const;
export const TrackKindSchema = z.enum(TRACK_KINDS);
export type TrackKind = z.infer<typeof TrackKindSchema>;

/** What an audio track is for — used to route AI output to the right lane. */
export const AUDIO_ROLES = ["narration", "dialogue", "music", "ambience", "sfx"] as const;
export const AudioRoleSchema = z.enum(AUDIO_ROLES);
export type AudioRole = z.infer<typeof AudioRoleSchema>;

export const TrackSchema = z.object({
  id: z.string().min(1),
  kind: TrackKindSchema,
  name: z.string(),
  role: AudioRoleSchema.nullable().default(null),
  muted: z.boolean().default(false),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
});
export type Track = z.infer<typeof TrackSchema>;

export const CLIP_KINDS = ["video", "image", "audio", "subtitle", "title"] as const;
export const ClipKindSchema = z.enum(CLIP_KINDS);
export type ClipKind = z.infer<typeof ClipKindSchema>;

/** Which track kind can hold each clip kind. */
export const TRACK_FOR_CLIP: Record<ClipKind, TrackKind> = {
  video: "video",
  image: "video",
  audio: "audio",
  subtitle: "text",
  title: "text",
};

export const MOTIONS = ["none", "zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"] as const;
export const MotionSchema = z.enum(MOTIONS);
export type Motion = z.infer<typeof MotionSchema>;

export const TRANSITIONS = ["none", "fade", "slide_left", "slide_up", "wipe", "zoom"] as const;
export const TransitionSchema = z.enum(TRANSITIONS);
export type TransitionType = z.infer<typeof TransitionSchema>;

export const ClipSchema = z.object({
  id: z.string().min(1),
  trackId: z.string().min(1),
  kind: ClipKindSchema,
  /** Media asset this clip plays; null for text clips. */
  assetId: z.string().nullable().default(null),
  label: z.string().default(""),
  /** Position on the timeline. */
  start: Seconds,
  duration: z.number().finite().positive(),
  /** In-point inside the source media (trim). */
  sourceStart: Seconds.default(0),
  /** Length of the source media, when it has one (audio/video). */
  sourceDuration: z.number().finite().positive().nullable().default(null),
  /** Linear gain for audio and video clips. 1 = unchanged. */
  volume: z.number().finite().min(0).max(2).default(1),
  fadeIn: Seconds.default(0),
  fadeOut: Seconds.default(0),
  /** Transition into this clip. */
  transition: TransitionSchema.default("none"),
  transitionDuration: Seconds.default(0.5),
  /** Camera movement for images and videos (Ken Burns style). */
  motion: MotionSchema.default("none"),
  motionStrength: z.number().finite().min(0).max(1).default(0.5),
  fit: z.enum(["cover", "contain"]).default("cover"),
  /** Text of subtitle and title clips. */
  text: z.string().default(""),
  /** Script scene this clip belongs to, if any. */
  sceneId: z.string().nullable().default(null),
});
export type Clip = z.infer<typeof ClipSchema>;
export type ClipInput = z.input<typeof ClipSchema>;

export const MarkerSchema = z.object({
  id: z.string().min(1),
  time: Seconds,
  label: z.string().default(""),
  sceneId: z.string().nullable().default(null),
});
export type Marker = z.infer<typeof MarkerSchema>;

export const TimelineSchema = z.object({
  schemaVersion: z.literal(TIMELINE_SCHEMA_VERSION),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30)]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tracks: z.array(TrackSchema),
  clips: z.array(ClipSchema).default([]),
  markers: z.array(MarkerSchema).default([]),
  /** When set, audio tracks can't be edited — the soundtrack is final. */
  audioLockedAt: z.string().nullable().default(null),
});
export type Timeline = z.infer<typeof TimelineSchema>;
export type TimelineInput = z.input<typeof TimelineSchema>;

export function parseTimeline(data: unknown): Timeline {
  return TimelineSchema.parse(data);
}

/** Short random id with a readable prefix, e.g. "clip_k3j9x2ab". */
export function newId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 10) ?? Math.random().toString(36).slice(2, 12);
  return `${prefix}_${random}`;
}

/** Default track layout for a new documentary. */
export function defaultTracks(): Track[] {
  const t = (id: string, kind: TrackKind, name: string, role: AudioRole | null = null): Track => ({
    id,
    kind,
    name,
    role,
    muted: false,
    hidden: false,
    locked: false,
  });
  return [
    t("subtitles", "text", "Subtitles"),
    t("v2", "video", "Video 2"),
    t("v1", "video", "Video 1"),
    t("narration", "audio", "Narration", "narration"),
    t("music", "audio", "Music", "music"),
    t("sfx", "audio", "Sound effects", "sfx"),
  ];
}

export function createTimeline(options: { fps: 24 | 25 | 30; width: number; height: number }): Timeline {
  return TimelineSchema.parse({
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    fps: options.fps,
    width: options.width,
    height: options.height,
    tracks: defaultTracks(),
  });
}

export const clipEnd = (clip: Pick<Clip, "start" | "duration">) => clip.start + clip.duration;

/** Length of the documentary: the end of the last clip (at least 1 second). */
export function timelineDuration(timeline: Pick<Timeline, "clips">): number {
  let end = 0;
  for (const c of timeline.clips) end = Math.max(end, clipEnd(c));
  return Math.max(1, Math.round(end * 1000) / 1000);
}

export function trackById(timeline: Timeline, id: string): Track | undefined {
  return timeline.tracks.find((t) => t.id === id);
}

export function clipsOnTrack(timeline: Timeline, trackId: string): Clip[] {
  return timeline.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
}

export function isAudioTrackLocked(timeline: Timeline, track: Track): boolean {
  return track.locked || (track.kind === "audio" && timeline.audioLockedAt !== null);
}
