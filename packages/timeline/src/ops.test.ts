import { describe, expect, it } from "vitest";
import { createTimeline, timelineDuration, type Timeline } from "./editor";
import {
  addClip,
  addTrack,
  deleteClips,
  findFreeStart,
  moveClip,
  removeTrack,
  setClipDuration,
  snapTime,
  splitClip,
  insertTime,
  TimelineOpError,
  trimClipEnd,
  trimClipStart,
  updateClip,
  updateTrack,
} from "./ops";
import { checkRenderReadiness } from "./check";

const base = () => createTimeline({ fps: 30, width: 1920, height: 1080 });

function withAudio(): { t: Timeline; id: string } {
  const { timeline, clip } = addClip(base(), {
    trackId: "narration",
    kind: "audio",
    assetId: "a1",
    start: 2,
    duration: 10,
    sourceDuration: 10,
  });
  return { t: timeline, id: clip.id };
}

describe("addClip", () => {
  it("adds to a compatible track", () => {
    const { t, id } = withAudio();
    expect(t.clips).toHaveLength(1);
    expect(t.clips[0]).toMatchObject({ id, start: 2, duration: 10, volume: 1 });
  });

  it("rejects incompatible tracks", () => {
    expect(() => addClip(base(), { trackId: "v1", kind: "audio", assetId: "a", start: 0, duration: 1 })).toThrow(TimelineOpError);
    expect(() => addClip(base(), { trackId: "narration", kind: "image", assetId: "i", start: 0, duration: 1 })).toThrow(/video track/);
  });

  it("never overlaps clips on the same track", () => {
    const { t } = withAudio();
    const { clip } = addClip(t, { trackId: "narration", kind: "audio", assetId: "a2", start: 5, duration: 3 });
    expect(clip.start).toBe(12); // nearest free: right after the first clip
    const { clip: before } = addClip(t, { trackId: "narration", kind: "audio", assetId: "a3", start: 1, duration: 1.5 });
    expect(before.start).toBe(0.5); // fits right before
  });
});

describe("moveClip", () => {
  it("moves in time and across compatible tracks", () => {
    const { t, id } = withAudio();
    const moved = moveClip(t, id, { start: 20, trackId: "music" });
    expect(moved.clips[0]).toMatchObject({ start: 20, trackId: "music" });
    expect(() => moveClip(t, id, { start: 0, trackId: "v1" })).toThrow(TimelineOpError);
  });

  it("clamps to zero and avoids overlap", () => {
    const { t, id } = withAudio();
    expect(moveClip(t, id, { start: -5 }).clips[0]!.start).toBe(0);
    const two = addClip(t, { trackId: "narration", kind: "audio", assetId: "b", start: 20, duration: 5 });
    const moved = moveClip(two.timeline, two.clip.id, { start: 8 });
    expect(moved.clips.find((c) => c.id === two.clip.id)!.start).toBe(12);
  });

  it("does not mutate the input", () => {
    const { t, id } = withAudio();
    const snapshot = structuredClone(t);
    moveClip(t, id, { start: 30 });
    expect(t).toEqual(snapshot);
  });
});

describe("trimming", () => {
  it("trims the start and moves the source in-point", () => {
    const { t, id } = withAudio();
    const trimmed = trimClipStart(t, id, 4);
    expect(trimmed.clips[0]).toMatchObject({ start: 4, duration: 8, sourceStart: 2 });
  });

  it("cannot extend media before its first frame", () => {
    const { t, id } = withAudio();
    expect(trimClipStart(t, id, 0).clips[0]).toMatchObject({ start: 2, duration: 10, sourceStart: 0 });
  });

  it("trims the end within the source length", () => {
    const { t, id } = withAudio();
    expect(trimClipEnd(t, id, 6).clips[0]!.duration).toBe(4);
    expect(trimClipEnd(t, id, 99).clips[0]!.duration).toBe(10);
    expect(trimClipEnd(t, id, 0).clips[0]!.duration).toBe(0.1);
  });

  it("lets images stretch freely but not into the next clip", () => {
    let t = addClip(base(), { trackId: "v1", kind: "image", assetId: "i1", start: 0, duration: 5 }).timeline;
    t = addClip(t, { trackId: "v1", kind: "image", assetId: "i2", start: 8, duration: 5 }).timeline;
    const first = t.clips[0]!.id;
    expect(trimClipEnd(t, first, 20).clips[0]!.duration).toBe(8);
    expect(setClipDuration(t, first, 6.5).clips[0]!.duration).toBe(6.5);
  });
});

describe("splitClip", () => {
  it("splits into two continuous clips", () => {
    const { t, id } = withAudio();
    const { timeline, rightId } = splitClip(t, id, 5);
    const left = timeline.clips.find((c) => c.id === id)!;
    const right = timeline.clips.find((c) => c.id === rightId)!;
    expect(left).toMatchObject({ start: 2, duration: 3, sourceStart: 0 });
    expect(right).toMatchObject({ start: 5, duration: 7, sourceStart: 3 });
  });

  it("refuses to split at the edges", () => {
    const { t, id } = withAudio();
    expect(() => splitClip(t, id, 2)).toThrow(TimelineOpError);
    expect(() => splitClip(t, id, 30)).toThrow(TimelineOpError);
  });
});

describe("clip properties, tracks and locking", () => {
  it("updates allowed properties and clamps fades", () => {
    const { t, id } = withAudio();
    const u = updateClip(t, id, { volume: 0.5, fadeIn: 20, fadeOut: 3 });
    expect(u.clips[0]).toMatchObject({ volume: 0.5, fadeIn: 10, fadeOut: 0 });
  });

  it("blocks edits on locked tracks and locked audio", () => {
    const { t, id } = withAudio();
    const locked = updateTrack(t, "narration", { locked: true });
    expect(() => moveClip(locked, id, { start: 5 })).toThrow(/locked/);
    const audioLocked = { ...t, audioLockedAt: new Date().toISOString() };
    expect(() => deleteClips(audioLocked, [id])).toThrow(/audio is locked/);
    // Video edits still allowed while audio is locked.
    expect(() => addClip(audioLocked, { trackId: "v1", kind: "image", assetId: "x", start: 0, duration: 2 })).not.toThrow();
  });

  it("adds video tracks above, audio tracks below, and removes only empty tracks", () => {
    const { timeline: t1, track: v } = addTrack(base(), "video");
    expect(t1.tracks.findIndex((tr) => tr.id === v.id)).toBe(t1.tracks.findIndex((tr) => tr.kind === "video"));
    const { timeline: t2, track: a } = addTrack(t1, "audio", { role: "ambience" });
    expect(t2.tracks[t2.tracks.length - 1]!.id).toBe(a.id);
    const { t } = withAudio();
    expect(() => removeTrack(t, "narration")).toThrow(/clips/);
    expect(removeTrack(t2, a.id).tracks).toHaveLength(t1.tracks.length);
  });
});

describe("helpers", () => {
  it("snaps to nearby edges and markers", () => {
    const { t } = withAudio();
    expect(snapTime(t, 11.9, { threshold: 0.2 })).toBe(12);
    expect(snapTime(t, 7, { threshold: 0.2 })).toBe(7);
    expect(snapTime(t, 0.1, { threshold: 0.2 })).toBe(0);
  });

  it("finds free positions", () => {
    const { t } = withAudio();
    expect(findFreeStart(t, "narration", 3, 2)).toBe(0);
    expect(findFreeStart(t, "narration", 3, 4)).toBe(12);
  });

  it("measures duration and render readiness", () => {
    const { t } = withAudio();
    expect(timelineDuration(t)).toBe(12);
    const issues = checkRenderReadiness(t, new Set());
    expect(issues.some((i) => i.severity === "error")).toBe(true);
    const ok = checkRenderReadiness(t, new Set(["a1"]));
    expect(ok.filter((i) => i.severity === "error")).toEqual([]);
  });
});

describe("insertTime", () => {
  it("pushes later clips and markers", () => {
    let t = addClip(base(), { trackId: "v1", kind: "image", assetId: "i1", start: 0, duration: 5 }).timeline;
    t = addClip(t, { trackId: "v1", kind: "image", assetId: "i2", start: 5, duration: 5 }).timeline;
    t = { ...t, markers: [{ id: "m", time: 5, label: "", sceneId: null }] };
    const out = insertTime(t, 5, 3);
    expect(out.clips.map((c) => c.start)).toEqual([0, 8]);
    expect(out.markers[0]!.time).toBe(8);
  });
});

describe("defaultTrackFor", () => {
  it("puts pictures on the main lane and audio by role", async () => {
    const { defaultTrackFor } = await import("./ops");
    const t = base();
    expect(defaultTrackFor(t, "image")?.id).toBe("v1");
    expect(defaultTrackFor(t, "audio", "music")?.id).toBe("music");
    expect(defaultTrackFor(t, "audio", "narration")?.id).toBe("narration");
    expect(defaultTrackFor(t, "subtitle")?.id).toBe("subtitles");
  });
});
