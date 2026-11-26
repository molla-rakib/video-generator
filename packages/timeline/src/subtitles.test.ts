import { describe, expect, it } from "vitest";
import { buildSubtitleCues } from "./subtitles";

describe("buildSubtitleCues", () => {
  it("groups words and breaks at the Bangla dari", () => {
    const words = [
      { start: 0, end: 0.4, word: "১৯৭১" },
      { start: 0.4, end: 0.9, word: "সালের" },
      { start: 0.9, end: 1.5, word: "মার্চ।" },
      { start: 1.8, end: 2.2, word: "শুরু" },
      { start: 2.2, end: 2.6, word: "হলো" },
      { start: 2.6, end: 3.1, word: "যুদ্ধ।" },
    ];
    expect(buildSubtitleCues(words, [])).toEqual([
      { start: 0, end: 1.5, text: "১৯৭১ সালের মার্চ।" },
      { start: 1.8, end: 3.1, text: "শুরু হলো যুদ্ধ।" },
    ]);
  });

  it("limits line length and duration", () => {
    const words = Array.from({ length: 20 }, (_, i) => ({ start: i * 0.5, end: i * 0.5 + 0.5, word: "শব্দ" }));
    const cues = buildSubtitleCues(words, [], { maxChars: 20, maxSeconds: 3 });
    expect(cues.every((c) => c.text.length <= 20 && c.end - c.start <= 3)).toBe(true);
    expect(cues.map((c) => c.text).join(" ").split(" ")).toHaveLength(20);
  });

  it("splits long segments when there are no word timings", () => {
    const cues = buildSubtitleCues([], [{ start: 0, end: 6, text: "এটি একটি অনেক লম্বা বাক্য যা দুই লাইনে ভাগ হওয়া উচিত কারণ এটি বড়" }], { maxChars: 30 });
    expect(cues.length).toBeGreaterThan(1);
    expect(cues[0]!.start).toBe(0);
    expect(cues[cues.length - 1]!.end).toBeCloseTo(6);
  });
});
