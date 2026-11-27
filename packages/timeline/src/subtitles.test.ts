import { describe, expect, it } from "vitest";
import { cleanCueText, parseSubtitles } from "./subtitles";

const SRT = `1
00:00:00,500 --> 00:00:02,000
[happy] এক রাতে, ছোট্ট এক শহরে…

2
00:00:02,000 --> 00:00:04,250
<i>Hello</i>
there

3
00:00:04,000 --> 00:00:05,000
[whispers]

4
00:00:05,100 --> 00:00:07,000
quietly now
`;

describe("parseSubtitles", () => {
  it("reads SRT cues, strips tags and keeps them as hints", () => {
    const { cues, emotionHints } = parseSubtitles(SRT);
    expect(cues).toHaveLength(3);
    expect(cues[0]).toMatchObject({ start: 0.5, end: 2, text: "এক রাতে, ছোট্ট এক শহরে…", tags: ["happy"] });
    expect(cues[1]).toMatchObject({ text: "Hello\nthere", start: 2, end: 4.25 });
    // A tag-only cue moves onto the next spoken line.
    expect(cues[2]).toMatchObject({ text: "quietly now", tags: ["whispers"] });
    expect(emotionHints).toEqual([
      { atSec: 0.5, tag: "happy" },
      { atSec: 4, tag: "whispers" },
    ]);
  });

  it("reads WebVTT with hour-less timestamps", () => {
    const { cues } = parseSubtitles("WEBVTT\n\n00:01.000 --> 00:02.500\nHi\n\n00:03.000 --> 00:04.000 align:center\nBye");
    expect(cues.map((c) => [c.start, c.end, c.text])).toEqual([
      [1, 2.5, "Hi"],
      [3, 4, "Bye"],
    ]);
  });

  it("removes overlaps", () => {
    const { cues } = parseSubtitles("1\n00:00:00,000 --> 00:00:03,000\nA\n\n2\n00:00:02,000 --> 00:00:04,000\nB");
    expect(cues[0]!.end).toBe(2);
    expect(cues[1]!.start).toBe(2);
  });

  it("rejects files without cues", () => {
    expect(() => parseSubtitles("just some text")).toThrow(/No subtitles/);
  });

  it("handles ElevenLabs tags that carry a full stop", () => {
    const { cues } = parseSubtitles(
      '1\n00:00:00,000 --> 00:00:00,160\n[Opening Hook].\n\n2\n00:00:00,656 --> 00:00:06,363\nইমন আজ এসেছে।\n\n3\n00:00:12,221 --> 00:00:16,576\nগর্ব করতে\nপারেন?" [Serious].\n',
    );
    expect(cues.map((c) => c.text)).toEqual(["ইমন আজ এসেছে।", 'গর্ব করতে\nপারেন?"']);
    expect(cues[0]).toMatchObject({ start: 0.656, end: 6.363, tags: ["opening hook"] });
    expect(cues[1]!.tags).toEqual(["serious"]);
  });

  it("cleans dangling half-tags", () => {
    expect(cleanCueText("Hello [Dramat").text).toBe("Hello");
  });
});
