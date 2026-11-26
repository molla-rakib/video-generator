import { describe, expect, it } from "vitest";
import { createTimeline } from "./editor";
import { layoutNarration, layoutSceneVisuals, placeSubtitles, sceneRanges, ScriptSchema } from "./script";

const base = () => createTimeline({ fps: 30, width: 1920, height: 1080 });

describe("layoutNarration", () => {
  it("places scene narration in order with gaps and scene markers", () => {
    const t = layoutNarration(base(), [
      { sceneId: "s1", assetId: "a1", duration: 10, label: "দৃশ্য ১" },
      { sceneId: "s2", assetId: "a2", duration: 8, label: "দৃশ্য ২" },
    ]);
    const clips = t.clips.filter((c) => c.trackId === "narration");
    expect(clips.map((c) => [c.start, c.duration])).toEqual([
      [0, 10],
      [10.6, 8],
    ]);
    expect(t.markers.map((m) => [m.time, m.label])).toEqual([
      [0, "দৃশ্য ১"],
      [10.6, "দৃশ্য ২"],
    ]);
  });

  it("replaces a scene's narration when regenerated", () => {
    let t = layoutNarration(base(), [{ sceneId: "s1", assetId: "a1", duration: 10, label: "1" }]);
    t = layoutNarration(t, [{ sceneId: "s1", assetId: "a1b", duration: 12, label: "1" }]);
    expect(t.clips).toHaveLength(1);
    expect(t.clips[0]).toMatchObject({ assetId: "a1b", duration: 12 });
    expect(t.markers).toHaveLength(1);
  });
});

describe("placeSubtitles", () => {
  it("offsets cues by the clip position and respects trimming", () => {
    let t = layoutNarration(base(), [
      { sceneId: "s1", assetId: "a1", duration: 10, label: "1" },
      { sceneId: "s2", assetId: "a2", duration: 6, label: "2" },
    ]);
    const second = t.clips.find((c) => c.sceneId === "s2")!;
    t = placeSubtitles(t, second, [
      { start: 0, end: 2.5, text: "আমাদের গল্প" },
      { start: 2.5, end: 5.9, text: "শুরু হয় এখানে।" },
    ]);
    const subs = t.clips.filter((c) => c.kind === "subtitle");
    expect(subs.map((s) => [s.start, s.duration, s.text])).toEqual([
      [10.6, 2.5, "আমাদের গল্প"],
      [13.1, 3.4, "শুরু হয় এখানে।"],
    ]);
    // Re-running replaces instead of duplicating.
    t = placeSubtitles(t, second, [{ start: 0, end: 5, text: "নতুন" }]);
    expect(t.clips.filter((c) => c.kind === "subtitle")).toHaveLength(1);
  });
});

describe("layoutSceneVisuals", () => {
  it("stretches shots to fill the scene's narration", () => {
    let t = layoutNarration(base(), [{ sceneId: "s1", assetId: "a1", duration: 12, label: "1" }]);
    const scene = ScriptSchema.parse({
      scenes: [
        {
          id: "s1",
          title: "Storm",
          narration: "ঝড় এল।",
          shots: [
            { id: "sh1", description: "Sea", imagePrompt: "sea", duration: 4, assetId: "img1" },
            { id: "sh2", description: "Boat", imagePrompt: "boat", duration: 2, assetId: "img2" },
          ],
        },
      ],
    }).scenes[0]!;
    const assets = new Map([
      ["img1", { kind: "image" as const, duration: null }],
      ["img2", { kind: "image" as const, duration: null }],
    ]);
    t = layoutSceneVisuals(t, scene, assets);
    const visuals = t.clips.filter((c) => c.kind === "image").sort((a, b) => a.start - b.start);
    expect(visuals.map((c) => [c.start, c.duration])).toEqual([
      [0, 8],
      [8, 4],
    ]);
    expect(sceneRanges(t).get("s1")).toEqual({ start: 0, end: 12 });
  });
});
