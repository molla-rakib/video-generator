import type { MediaAsset } from "@studio/database";
import { addClip, addTrack, defaultTrackFor, TRACK_FOR_CLIP, TRACK_ROLES, type Timeline, type Track, type TrackRole } from "@studio/timeline";

const AUDIO_ROLES = new Set<TrackRole>(["voice", "music", "sfx", "ambience", "other"]);

/** The track role a media file belongs on. */
export function roleForAsset(asset: MediaAsset): TrackRole {
  if (asset.kind === "image" || asset.kind === "video") return "overlay";
  const role = asset.role as TrackRole | null;
  return role && (TRACK_ROLES as readonly string[]).includes(role) && AUDIO_ROLES.has(role) ? role : "other";
}

/** Default loudness for a new clip, following the mix rules (music and SFX sit under the voice). */
function defaultVolume(role: TrackRole): number {
  return role === "music" || role === "sfx" || role === "ambience" ? 0.5 : 1;
}

/**
 * Add a media file to the timeline at `at` seconds — on `preferred` when it
 * fits there, otherwise on the usual track for it (created if needed).
 */
export function placeAsset(t: Timeline, asset: MediaAsset, at: number, preferred?: Track): Timeline {
  if (asset.status !== "ready") throw new Error("This file is still being prepared. Try again in a moment.");
  if (asset.kind === "render") throw new Error("Exported videos can't be added to the timeline.");
  const kind = asset.kind === "image" ? "image" : asset.kind === "video" ? "video" : "audio";
  const role = roleForAsset(asset);
  let next = t;
  const want = TRACK_FOR_CLIP[kind];
  let track = preferred && preferred.kind === want && !preferred.locked ? preferred : defaultTrackFor(next, kind, role);
  if (!track) ({ timeline: next, track } = addTrack(next, role));
  return addClip(next, {
    trackId: track.id,
    kind,
    src: asset.path,
    label: asset.name,
    start: at,
    duration: kind === "image" ? 5 : (asset.durationSeconds ?? 5),
    sourceDuration: kind === "image" ? null : asset.durationSeconds,
    transition: kind === "audio" ? "none" : "fade",
    transitionDuration: 0.3,
    volume: defaultVolume(track.role),
    meta: asset.prompt ? { prompt: asset.prompt } : {},
  }).timeline;
}
