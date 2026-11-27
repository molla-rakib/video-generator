import { z } from "zod";
import { AspectRatioSchema, ASPECT_RATIOS, FpsSchema, type AspectRatio } from "@studio/shared";

/**
 * PROJECT DOCUMENT — `project.json`
 *
 * The single source of truth for a video. It lives in the project folder
 * (`storage/projects/<id>/project.json`) next to the files it points at, so
 * the editor, the renderer and an external AI agent (Claude Code) all read
 * and write the same thing. Everything is in SECONDS.
 *
 *   tracks  — ordered top-to-bottom as shown in the editor. For visual tracks
 *             the higher track is drawn in front (overlays above scenes).
 *   clips   — each belongs to one track. Media clips point at a file by a
 *             project-relative path (`src`, e.g. "audio/sfx/rain.mp3");
 *             scene clips point at a Remotion component (`component`, e.g.
 *             "scenes/Shot01.tsx") and pass it `props`.
 *   markers — named points on the ruler (shots, beats).
 */

export const PROJECT_SCHEMA_VERSION = 3 as const;

const Seconds = z.number().finite().nonnegative();

export const TRACK_KINDS = ["video", "audio", "text"] as const;
export const TrackKindSchema = z.enum(TRACK_KINDS);
export type TrackKind = z.infer<typeof TrackKindSchema>;

/**
 * What a track is for. Video tracks hold `scenes` (the animation) or
 * `overlay` (your own clips, pictures, logos on top). Audio tracks hold the
 * `voice`, `music`, `sfx` or anything else. Text tracks hold `captions` or
 * `titles`.
 */
export const TRACK_ROLES = ["scenes", "overlay", "voice", "music", "sfx", "ambience", "other", "captions", "titles"] as const;
export const TrackRoleSchema = z.enum(TRACK_ROLES);
export type TrackRole = z.infer<typeof TrackRoleSchema>;

export const ROLE_KIND: Record<TrackRole, TrackKind> = {
  scenes: "video",
  overlay: "video",
  voice: "audio",
  music: "audio",
  sfx: "audio",
  ambience: "audio",
  other: "audio",
  captions: "text",
  titles: "text",
};

export const TrackSchema = z.object({
  id: z.string().min(1),
  kind: TrackKindSchema,
  role: TrackRoleSchema,
  name: z.string(),
  muted: z.boolean().default(false),
  solo: z.boolean().default(false),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
  /** Track gain, multiplied with each clip's volume. 1 = unchanged. */
  volume: z.number().finite().min(0).max(2).default(1),
});
export type Track = z.infer<typeof TrackSchema>;

export const CLIP_KINDS = ["scene", "video", "image", "audio", "caption", "title"] as const;
export const ClipKindSchema = z.enum(CLIP_KINDS);
export type ClipKind = z.infer<typeof ClipKindSchema>;

/** Which track kind can hold each clip kind. */
export const TRACK_FOR_CLIP: Record<ClipKind, TrackKind> = {
  scene: "video",
  video: "video",
  image: "video",
  audio: "audio",
  caption: "text",
  title: "text",
};

export const MOTIONS = ["none", "zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"] as const;
export const MotionSchema = z.enum(MOTIONS);
export type Motion = z.infer<typeof MotionSchema>;

/**
 * How a clip arrives. The outgoing shot keeps playing underneath for the
 * transition's length, so these are real two-shot transforms, not fades
 * from black. "morph" and "zoom_through" are the studio's flowing defaults;
 * "none" is a hard cut (for dramatic beats).
 */
export const TRANSITIONS = ["none", "morph", "zoom_through", "whip", "iris", "fade", "slide_left", "slide_up", "wipe", "zoom"] as const;
export const TransitionSchema = z.enum(TRANSITIONS);
export type TransitionType = z.infer<typeof TransitionSchema>;

/**
 * Where a visual clip sits in the frame, as fractions of the canvas
 * (0–1, top-left origin). Used for picture-in-picture, logos and the like.
 */
export const BoxSchema = z.object({
  x: z.number().finite().min(-1).max(2),
  y: z.number().finite().min(-1).max(2),
  w: z.number().finite().positive().max(3),
  h: z.number().finite().positive().max(3),
  /** Corner rounding as a fraction of the box's short side (0.5 = circle/pill). */
  radius: z.number().finite().min(0).max(0.5).default(0),
});
export type Box = z.infer<typeof BoxSchema>;

/**
 * A visual clip's placement. `default` applies to every aspect ratio unless
 * `byRatio` has an entry for it — so a face-cam can sit bottom-right in 16:9
 * and bottom-centre in 9:16. Null means full frame.
 */
export const LayoutSchema = z.object({
  default: BoxSchema.nullable().default(null),
  byRatio: z.partialRecord(AspectRatioSchema, BoxSchema.nullable()).default({}),
});
export type Layout = z.infer<typeof LayoutSchema>;

/** Project-relative file path, forward slashes, no "..". */
export const ProjectPathSchema = z
  .string()
  .min(1)
  .max(400)
  .refine((p) => !p.startsWith("/") && !p.includes("\\") && !p.split("/").some((s) => s === ".." || s === "." || s === ""), {
    message: "Must be a path inside the project folder, like media/clip.mp4",
  });

export const ClipSchema = z.object({
  id: z.string().min(1),
  trackId: z.string().min(1),
  kind: ClipKindSchema,
  label: z.string().default(""),
  /** File played by media clips (video, image, audio), relative to the project folder. */
  src: ProjectPathSchema.nullable().default(null),
  /** Remotion component of a scene clip, relative to the project folder. */
  component: ProjectPathSchema.nullable().default(null),
  /** Parameters passed to the scene component (light level, zoom, expression…). */
  props: z.record(z.string(), z.unknown()).default({}),
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
  /** Camera movement for pictures and video (Ken Burns style). */
  motion: MotionSchema.default("none"),
  motionStrength: z.number().finite().min(0).max(1).default(0.5),
  fit: z.enum(["cover", "contain"]).default("cover"),
  layout: LayoutSchema.default({ default: null, byRatio: {} }),
  /** Text of caption and title clips. */
  text: z.string().default(""),
  /** Free-form notes from whoever made the clip (e.g. the SFX prompt). */
  meta: z.record(z.string(), z.unknown()).default({}),
});
export type Clip = z.infer<typeof ClipSchema>;
export type ClipInput = z.input<typeof ClipSchema>;

export const MarkerSchema = z.object({
  id: z.string().min(1),
  time: Seconds,
  label: z.string().default(""),
});
export type Marker = z.infer<typeof MarkerSchema>;

/** Default level rules: music and SFX sit under the voice. */
export const MixSchema = z.object({
  musicVsVoiceDb: z.number().finite().default(-6),
  sfxVsVoiceDb: z.number().finite().default(-6),
  sfxPeakCap: z.number().finite().min(0).max(1).default(0.7),
  targetLufs: z.number().finite().default(-14),
});
export type Mix = z.infer<typeof MixSchema>;

export const CaptionStyleSchema = z.object({
  /** Font size as a fraction of the frame's short side. */
  size: z.number().finite().min(0.01).max(0.2).default(0.045),
  color: z.string().default("#ffffff"),
  background: z.string().default("rgba(0,0,0,0.55)"),
  /** Distance from the bottom as a fraction of the frame height. */
  bottom: z.number().finite().min(0).max(0.9).default(0.08),
});
export type CaptionStyle = z.infer<typeof CaptionStyleSchema>;

export const ProjectDocSchema = z.object({
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  /** Increments on every save — used to notice changes made elsewhere. */
  revision: z.number().int().nonnegative().default(0),
  updatedBy: z.enum(["user", "agent", "system"]).default("system"),
  fps: FpsSchema.default(30),
  /** The shape you are editing in (the preview's frame). */
  ratio: AspectRatioSchema.default("9:16"),
  /** Shapes this video is meant to be exported in. */
  ratios: z.array(AspectRatioSchema).min(1).default(["9:16"]),
  /** Style preset used to generate the video, if any. */
  style: z.string().nullable().default(null),
  tracks: z.array(TrackSchema),
  clips: z.array(ClipSchema).default([]),
  markers: z.array(MarkerSchema).default([]),
  mix: MixSchema.default({ musicVsVoiceDb: -6, sfxVsVoiceDb: -6, sfxPeakCap: 0.7, targetLufs: -14 }),
  captionStyle: CaptionStyleSchema.default({ size: 0.045, color: "#ffffff", background: "rgba(0,0,0,0.55)", bottom: 0.08 }),
});
/** The editable project. Called "timeline" throughout the editor. */
export type Timeline = z.infer<typeof ProjectDocSchema>;
export type TimelineInput = z.input<typeof ProjectDocSchema>;

export function parseTimeline(data: unknown): Timeline {
  return ProjectDocSchema.parse(data);
}

/** Short random id with a readable prefix, e.g. "clip_k3j9x2ab". */
export function newId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 10) ?? Math.random().toString(36).slice(2, 12);
  return `${prefix}_${random}`;
}

function track(id: string, role: TrackRole, name: string, extra: Partial<Track> = {}): Track {
  return { id, kind: ROLE_KIND[role], role, name, muted: false, solo: false, hidden: false, locked: false, volume: 1, ...extra };
}

/** Default track layout: overlays above scenes, then captions, then the sound. */
export function defaultTracks(): Track[] {
  return [
    track("captions", "captions", "Captions"),
    track("overlay", "overlay", "Overlays"),
    track("scenes", "scenes", "Scenes"),
    track("voice", "voice", "Voice", { locked: true }),
    track("music", "music", "Music"),
    track("sfx", "sfx", "Sound effects"),
  ];
}

export function createTimeline(options: { fps?: 24 | 25 | 30 | 60; ratio?: AspectRatio; ratios?: AspectRatio[]; style?: string | null } = {}): Timeline {
  const ratio = options.ratio ?? "9:16";
  return ProjectDocSchema.parse({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    fps: options.fps ?? 30,
    ratio,
    ratios: options.ratios?.length ? options.ratios : [ratio],
    style: options.style ?? null,
    tracks: defaultTracks(),
  });
}

export const clipEnd = (clip: Pick<Clip, "start" | "duration">) => clip.start + clip.duration;

/** Length of the video: the end of the last clip (at least 1 second). */
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

export function isTrackLocked(_timeline: Timeline, track: Track): boolean {
  return track.locked;
}

/** The box a visual clip uses in a given aspect ratio (null = full frame). */
export function boxFor(clip: Pick<Clip, "layout">, ratio: AspectRatio): Box | null {
  const specific = clip.layout.byRatio[ratio];
  return specific !== undefined ? specific : clip.layout.default;
}

/** True when any audio track is soloed — then only soloed tracks are heard. */
export function audibleTracks(timeline: Timeline): Set<string> {
  const audio = timeline.tracks.filter((t) => t.kind === "audio" || t.kind === "video");
  const soloed = audio.filter((t) => t.solo);
  const heard = (soloed.length ? soloed : audio).filter((t) => !t.muted);
  return new Set(heard.map((t) => t.id));
}

export { ASPECT_RATIOS };
