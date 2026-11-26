import { describe, expect, it } from "vitest";
import {
  durationInFrames,
  formatClock,
  formatDurationHuman,
  framesToSeconds,
  msToSeconds,
  roundTime,
  secondsToFrames,
  secondsToMs,
  snapToFrame,
} from "./time";

describe("secondsToFrames", () => {
  it("uses Math.round(seconds * fps)", () => {
    expect(secondsToFrames(0, 30)).toBe(0);
    expect(secondsToFrames(1, 30)).toBe(30);
    expect(secondsToFrames(2.5, 24)).toBe(60);
    expect(secondsToFrames(1.016, 30)).toBe(30); // 30.48 → 30
    expect(secondsToFrames(1.017, 30)).toBe(31); // 30.51 → 31
  });

  it("is stable for float noise", () => {
    expect(secondsToFrames(0.1 + 0.2, 30)).toBe(9);
  });

  it("rejects invalid fps and non-finite seconds", () => {
    expect(() => secondsToFrames(1, 0)).toThrow(RangeError);
    expect(() => secondsToFrames(1, -24)).toThrow(RangeError);
    expect(() => secondsToFrames(Number.NaN, 30)).toThrow(RangeError);
    expect(() => secondsToFrames(Number.POSITIVE_INFINITY, 30)).toThrow(RangeError);
  });
});

describe("framesToSeconds", () => {
  it("round-trips with secondsToFrames on frame boundaries", () => {
    for (const fps of [24, 25, 30]) {
      for (let frame = 0; frame < 200; frame += 7) {
        expect(secondsToFrames(framesToSeconds(frame, fps), fps)).toBe(frame);
      }
    }
  });

  it("rounds to millisecond precision", () => {
    expect(framesToSeconds(1, 30)).toBe(0.033);
    expect(framesToSeconds(1, 24)).toBe(0.042);
  });
});

describe("durationInFrames", () => {
  it("is never less than one frame", () => {
    expect(durationInFrames(0, 30)).toBe(1);
    expect(durationInFrames(0.001, 30)).toBe(1);
    expect(durationInFrames(10, 30)).toBe(300);
  });
});

describe("ms conversion", () => {
  it("converts both ways", () => {
    expect(msToSeconds(1500)).toBe(1.5);
    expect(secondsToMs(1.5)).toBe(1500);
    expect(secondsToMs(0.0004)).toBe(0);
  });
});

describe("roundTime / snapToFrame", () => {
  it("removes float noise and negative zero", () => {
    expect(roundTime(0.1 + 0.2)).toBe(0.3);
    expect(Object.is(roundTime(-0.0001), 0)).toBe(true);
  });

  it("snaps to the nearest frame", () => {
    expect(snapToFrame(1.01, 30)).toBe(1);
    expect(snapToFrame(1.02, 30)).toBe(1.033);
  });
});

describe("formatting", () => {
  it("formats clocks", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65.9)).toBe("1:05");
    expect(formatClock(3723)).toBe("1:02:03");
    expect(formatClock(-5)).toBe("-0:05");
  });

  it("formats human durations", () => {
    expect(formatDurationHuman(45)).toBe("45 sec");
    expect(formatDurationHuman(180)).toBe("3 min");
    expect(formatDurationHuman(200)).toBe("3 min 20 sec");
    expect(formatDurationHuman(3720)).toBe("1 hr 2 min");
  });
});
