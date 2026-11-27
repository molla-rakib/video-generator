import { describe, expect, it } from "vitest";
import { audibleTracks, boxFor, createTimeline, parseTimeline, timelineDuration, type Timeline } from "./editor";
import {
  addClip,
  addTrack,
  defaultTrackFor,
  deleteClips,
  findFreeStart,
  insertTime,
  moveClip,
  pipBox,
  removeTrack,
  replaceClipSource,
  setClipDuration,
  setClipLayout,
  setEditingRatio,
  snapTime,
  splitClip,
  TimelineOpError,
  trimClipEnd,
  trimClipStart,
  updateClip,
  updateClips,
  updateTrack,
} from "./ops";
import { checkRenderReadiness, referencedFiles } from "./check";

const base = () => createTimeline({ fps: 30, ratio: "9:16" });

function withSfx(): { t: Timeline; id: string } {
  const { timeline, clip } = addClip(base(), {
    trackId: "sfx",
    kind: "audio",
    src: "audio/sfx/rain.mp3",
    start: 2,
    duration: 10,
    sourceDuration: 10,
  });
  return { t: timeline, id: clip.id };
}

describe("project document", () => {
  it("creates a valid project with the default tracks", () => {
    const t = base();
    expect(t.tracks.map((tr) => tr.role)).toEqual(["captions", "overlay", "scenes", "voice", "music", "sfx"]);
    expect(t.tracks.find((tr) => tr.role === "voice")?.locked).toBe(true);
    expect(t.ratios).toEqual(["9:16"]);
    expect(parseTimeline(JSON.parse(JSON.stringify(t)))).toEqual(t);
  });

  it("rejects paths that escape the project folder", () => {
    expect(() => addClip(base(), { trackId: "sfx", kind: "audio", src: "../secret.mp3", start: 0, duration: 1 })).toThrow();
    expect(() => addClip(base(), { trackId: "sfx", kind: "audio", src: "/etc/x.mp3", start: 0, duration: 1 })).toThrow();
  });
});

describe("addClip", () => {
  it("adds to a compatible track", () => {
    const { t, id } = withSfx();
    expect(t.clips).toHaveLength(1);
    expect(t.clips[0]).toMatchObject({ id, start: 2, duration: 10, volume: 1 });
  });

  it("rejects incompatible and locked tracks", () => {
    expect(() => addClip(base(), { trackId: "scenes", kind: "audio", src: "a.mp3", start: 0, duration: 1 })).toThrow(TimelineOpError);
    expect(() => addClip(base(), { trackId: "music", kind: "image", src: "i.png", start: 0, duration: 1 })).toThrow(/scene or overlay/);
    expect(() => addClip(base(), { trackId: "voice", kind: "audio", src: "v.mp3", start: 0, duration: 1 })).toThrow(/locked/);
  });

  it("never overlaps clips on the same track", () => {
    const { t } = withSfx();
    const { clip } = addClip(t, { trackId: "sfx", kind: "audio", src: "b.mp3", start: 5, duration: 3 });
    expect(clip.start).toBe(12); // nearest free: right after the first clip
    const { clip: before } = addClip(t, { trackId: "sfx", kind: "audio", src: "c.mp3", start: 1, duration: 1.5 });
    expect(before.start).toBe(0.5); // fits right before
  });
});

describe("moveClip", () => {
  it("moves in time and across compatible tracks", () => {
    const { t, id } = withSfx();
    const moved = moveClip(t, id, { start: 20, trackId: "music" });
    expect(moved.clips[0]).toMatchObject({ start: 20, trackId: "music" });
    expect(() => moveClip(t, id, { start: 0, trackId: "scenes" })).toThrow(TimelineOpError);
  });

  it("clamps to zero and avoids overlap", () => {
    const { t, id } = withSfx();
    expect(moveClip(t, id, { start: -5 }).clips[0]!.start).toBe(0);
    const two = addClip(t, { trackId: "sfx", kind: "audio", src: "b.mp3", start: 20, duration: 5 });
    const moved = moveClip(two.timeline, two.clip.id, { start: 8 });
    expect(moved.clips.find((c) => c.id === two.clip.id)!.start).toBe(12);
  });

  it("does not mutate the input", () => {
    const { t, id } = withSfx();
    const snapshot = structuredClone(t);
    moveClip(t, id, { start: 30 });
    expect(t).toEqual(snapshot);
  });
});

describe("trimming", () => {
  it("trims the start and moves the source in-point", () => {
    const { t, id } = withSfx();
    expect(trimClipStart(t, id, 4).clips[0]).toMatchObject({ start: 4, duration: 8, sourceStart: 2 });
  });

  it("cannot extend media before its first frame", () => {
    const { t, id } = withSfx();
    expect(trimClipStart(t, id, 0).clips[0]).toMatchObject({ start: 2, duration: 10, sourceStart: 0 });
  });

  it("trims the end within the source length", () => {
    const { t, id } = withSfx();
    expect(trimClipEnd(t, id, 6).clips[0]!.duration).toBe(4);
    expect(trimClipEnd(t, id, 99).clips[0]!.duration).toBe(10);
    expect(trimClipEnd(t, id, 0).clips[0]!.duration).toBe(0.1);
  });

  it("lets scenes stretch freely but not into the next clip", () => {
    let t = addClip(base(), { trackId: "scenes", kind: "scene", component: "scenes/A.tsx", start: 0, duration: 5 }).timeline;
    t = addClip(t, { trackId: "scenes", kind: "scene", component: "scenes/B.tsx", start: 8, duration: 5 }).timeline;
    const first = t.clips[0]!.id;
    expect(trimClipEnd(t, first, 20).clips[0]!.duration).toBe(8);
    expect(setClipDuration(t, first, 6.5).clips[0]!.duration).toBe(6.5);
  });
});

describe("splitClip", () => {
  it("splits into two continuous clips", () => {
    const { t, id } = withSfx();
    const { timeline, rightId } = splitClip(t, id, 5);
    expect(timeline.clips.find((c) => c.id === id)).toMatchObject({ start: 2, duration: 3, sourceStart: 0 });
    expect(timeline.clips.find((c) => c.id === rightId)).toMatchObject({ start: 5, duration: 7, sourceStart: 3 });
  });

  it("refuses to split at the edges", () => {
    const { t, id } = withSfx();
    expect(() => splitClip(t, id, 2)).toThrow(TimelineOpError);
    expect(() => splitClip(t, id, 30)).toThrow(TimelineOpError);
  });
});

describe("clip properties, tracks and locking", () => {
  it("updates allowed properties and clamps fades", () => {
    const { t, id } = withSfx();
    expect(updateClip(t, id, { volume: 0.5, fadeIn: 20, fadeOut: 3 }).clips[0]).toMatchObject({ volume: 0.5, fadeIn: 10, fadeOut: 0 });
  });

  it("changes several clips at once", () => {
    let { t } = withSfx();
    t = addClip(t, { trackId: "sfx", kind: "audio", src: "b.mp3", start: 20, duration: 2 }).timeline;
    const out = updateClips(t, t.clips.map((c) => c.id), { volume: 0.3 });
    expect(out.clips.map((c) => c.volume)).toEqual([0.3, 0.3]);
  });

  it("replaces a clip's file but keeps its place", () => {
    const { t, id } = withSfx();
    const tuned = updateClip(t, id, { volume: 0.4 });
    const out = replaceClipSource(tuned, id, "media/my-rain.wav", 6, "My rain");
    expect(out.clips[0]).toMatchObject({ src: "media/my-rain.wav", start: 2, duration: 6, sourceStart: 0, volume: 0.4, label: "My rain" });
  });

  it("blocks edits on locked tracks", () => {
    const { t, id } = withSfx();
    const locked = updateTrack(t, "sfx", { locked: true });
    expect(() => moveClip(locked, id, { start: 5 })).toThrow(/locked/);
    expect(() => deleteClips(locked, [id])).toThrow(/locked/);
  });

  it("places overlay tracks on top, audio at the bottom, and removes only empty tracks", () => {
    const { timeline: t1, track: o } = addTrack(base(), "overlay");
    expect(t1.tracks.findIndex((tr) => tr.id === o.id)).toBe(t1.tracks.findIndex((tr) => tr.kind === "video"));
    expect(o.name).toBe("Overlay 2");
    const { timeline: t2, track: a } = addTrack(t1, "ambience");
    expect(t2.tracks[t2.tracks.length - 1]!.id).toBe(a.id);
    const { t } = withSfx();
    expect(() => removeTrack(t, "sfx")).toThrow(/clips/);
    expect(removeTrack(t2, a.id).tracks).toHaveLength(t1.tracks.length);
  });

  it("mutes and solos", () => {
    const t = base();
    expect(audibleTracks(t).has("music")).toBe(true);
    const muted = updateTrack(t, "music", { muted: true });
    expect(audibleTracks(muted).has("music")).toBe(false);
    const solo = updateTrack(t, "voice", { solo: true });
    expect([...audibleTracks(solo)]).toEqual(["voice"]);
    expect(updateTrack(t, "music", { volume: 9 }).tracks.find((tr) => tr.id === "music")!.volume).toBe(2);
  });
});

describe("layout per aspect ratio", () => {
  it("uses a ratio's own box or falls back to the default", () => {
    let t = addClip(base(), { trackId: "overlay", kind: "video", src: "media/face.mp4", start: 0, duration: 5 }).timeline;
    const id = t.clips[0]!.id;
    expect(boxFor(t.clips[0]!, "16:9")).toBeNull();
    const corner = pipBox("bottom-right", "16:9");
    t = setClipLayout(t, id, "default", corner);
    const vertical = pipBox("bottom-left", "9:16");
    t = setClipLayout(t, id, "9:16", vertical);
    expect(boxFor(t.clips[0]!, "16:9")).toEqual(corner);
    expect(boxFor(t.clips[0]!, "4:5")).toEqual(corner);
    expect(boxFor(t.clips[0]!, "9:16")).toEqual(vertical);
    t = setClipLayout(t, id, "9:16", undefined);
    expect(boxFor(t.clips[0]!, "9:16")).toEqual(corner);
    t = setClipLayout(t, id, "1:1", null);
    expect(boxFor(t.clips[0]!, "1:1")).toBeNull();
  });

  it("keeps picture-in-picture boxes inside the frame", () => {
    for (const ratio of ["16:9", "9:16", "4:5", "1:1"] as const) {
      for (const pos of ["top-left", "top-right", "bottom-left", "bottom-right", "center"] as const) {
        const b = pipBox(pos, ratio);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(1);
        expect(b.y + b.h).toBeLessThanOrEqual(1);
      }
    }
  });

  it("refuses to lay out audio", () => {
    const { t, id } = withSfx();
    expect(() => setClipLayout(t, id, "default", null)).toThrow(TimelineOpError);
  });

  it("adds the editing shape to the export shapes", () => {
    const t = setEditingRatio(base(), "16:9");
    expect(t.ratio).toBe("16:9");
    expect(t.ratios).toEqual(["9:16", "16:9"]);
  });
});

describe("helpers", () => {
  it("snaps to nearby edges", () => {
    const { t } = withSfx();
    expect(snapTime(t, 11.9, { threshold: 0.2 })).toBe(12);
    expect(snapTime(t, 7, { threshold: 0.2 })).toBe(7);
    expect(snapTime(t, 0.1, { threshold: 0.2 })).toBe(0);
  });

  it("finds free positions", () => {
    const { t } = withSfx();
    expect(findFreeStart(t, "sfx", 3, 2)).toBe(0);
    expect(findFreeStart(t, "sfx", 3, 4)).toBe(12);
  });

  it("measures duration and render readiness", () => {
    let { t } = withSfx();
    t = addClip(t, { trackId: "scenes", kind: "scene", component: "scenes/A.tsx", start: 0, duration: 12 }).timeline;
    expect(timelineDuration(t)).toBe(12);
    expect(referencedFiles(t).sort()).toEqual(["audio/sfx/rain.mp3", "scenes/A.tsx"]);
    expect(checkRenderReadiness(t, new Set()).some((i) => i.severity === "error")).toBe(true);
    const ok = checkRenderReadiness(t, new Set(["audio/sfx/rain.mp3", "scenes/A.tsx"]));
    expect(ok).toEqual([]);
  });

  it("does not count picture-in-picture as filling the screen", () => {
    let t = addClip(base(), { trackId: "overlay", kind: "video", src: "media/face.mp4", start: 0, duration: 5 }).timeline;
    t = setClipLayout(t, t.clips[0]!.id, "default", pipBox("bottom-right", "9:16"));
    expect(checkRenderReadiness(t, new Set(["media/face.mp4"])).map((i) => i.message)).toContain("Nothing fills the screen yet — the video will be black.");
  });
});

describe("insertTime", () => {
  it("pushes later clips and markers", () => {
    let t = addClip(base(), { trackId: "scenes", kind: "scene", component: "scenes/A.tsx", start: 0, duration: 5 }).timeline;
    t = addClip(t, { trackId: "scenes", kind: "scene", component: "scenes/B.tsx", start: 5, duration: 5 }).timeline;
    t = { ...t, markers: [{ id: "m", time: 5, label: "" }] };
    const out = insertTime(t, 5, 3);
    expect(out.clips.map((c) => c.start)).toEqual([0, 8]);
    expect(out.markers[0]!.time).toBe(8);
  });
});

describe("defaultTrackFor", () => {
  it("routes clips by kind and role", () => {
    const t = base();
    expect(defaultTrackFor(t, "scene")?.id).toBe("scenes");
    expect(defaultTrackFor(t, "video")?.id).toBe("overlay");
    expect(defaultTrackFor(t, "image")?.id).toBe("overlay");
    expect(defaultTrackFor(t, "audio", "music")?.id).toBe("music");
    expect(defaultTrackFor(t, "audio", "sfx")?.id).toBe("sfx");
    // The voice track is locked by default, so audio falls through to music.
    expect(defaultTrackFor(t, "audio", "voice")?.id).toBe("music");
    expect(defaultTrackFor(t, "caption")?.id).toBe("captions");
  });
});
