/**
 * Turns a DocSpec into an ordered list of timed segments.
 * Shared by the Remotion renderer, the Player page and (later) the export pipeline,
 * so preview and final render always agree on timing.
 */
import type { Chapter, DocSpec, Scene, Transition } from "./schema";

/** Narration speed used until real TTS timestamps exist (≈ 150 words / minute). */
export const WORDS_PER_SECOND = 2.5;
/** Silence before narration starts in a scene. */
export const NARRATION_LEAD_IN_SEC = 0.4;
/** Breathing room after narration ends, before the transition. */
export const NARRATION_TAIL_SEC = 0.9;

export const OPENING_SEC = 4;
export const CHAPTER_CARD_SEC = 2.8;
export const END_CARD_SEC = 8;
const MIN_SCENE_SEC = 3;

export type Segment =
  | { kind: "opening"; key: string; from: number; durationInFrames: number; transition: Transition }
  | {
      kind: "chapter-card";
      key: string;
      from: number;
      durationInFrames: number;
      transition: Transition;
      chapter: Chapter;
      chapterIndex: number;
    }
  | {
      kind: "scene";
      key: string;
      from: number;
      durationInFrames: number;
      transition: Transition;
      scene: Scene;
      chapterIndex: number;
      /**
       * Narration window inside the segment, in frames (relative to segment start).
       * It begins after the incoming transition has finished.
       */
      narrationStart: number;
      narrationFrames: number;
      /** Frame (relative to segment start) when the incoming transition has finished. */
      visibleStart: number;
    }
  | { kind: "end-card"; key: string; from: number; durationInFrames: number; transition: Transition };

export type Timeline = {
  fps: number;
  segments: Segment[];
  durationInFrames: number;
};

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function estimateNarrationSec(text: string): number {
  return countWords(text) / WORDS_PER_SECOND;
}

const CUT: Transition = { type: "cut", durationSec: 0 };
const DISSOLVE: Transition = { type: "dissolve", durationSec: 0.8 };
const DIP: Transition = { type: "dip-to-black", durationSec: 1 };

export function transitionFrames(t: Transition, fps: number): number {
  return t.type === "cut" ? 0 : Math.round(t.durationSec * fps);
}

export function buildTimeline(spec: DocSpec): Timeline {
  const fps = spec.meta.fps;
  const s = (sec: number) => Math.round(sec * fps);

  // 1. Collect segments with their *visible* lengths.
  type Draft =
    | Omit<Extract<Segment, { kind: "opening" }>, "from" | "durationInFrames"> & { base: number }
    | Omit<Extract<Segment, { kind: "chapter-card" }>, "from" | "durationInFrames"> & { base: number }
    | Omit<Extract<Segment, { kind: "scene" }>, "from" | "durationInFrames"> & { base: number }
    | Omit<Extract<Segment, { kind: "end-card" }>, "from" | "durationInFrames"> & { base: number };

  const drafts: Draft[] = [];
  drafts.push({ kind: "opening", key: "opening", base: s(OPENING_SEC), transition: DIP });

  spec.chapters.forEach((chapter, chapterIndex) => {
    if (chapter.showTitleCard) {
      drafts.push({
        kind: "chapter-card",
        key: `chapter-${chapter.id}`,
        base: s(CHAPTER_CARD_SEC),
        transition: DISSOLVE,
        chapter,
        chapterIndex,
      });
    }
    for (const scene of chapter.scenes) {
      const narrationSec = estimateNarrationSec(scene.narration);
      const contentSec = Math.max(
        scene.durationSec ?? 0,
        narrationSec > 0 ? NARRATION_LEAD_IN_SEC + narrationSec + NARRATION_TAIL_SEC : 0,
        MIN_SCENE_SEC,
      );
      drafts.push({
        kind: "scene",
        key: `scene-${scene.id}`,
        base: s(contentSec),
        transition: scene.transition,
        scene,
        chapterIndex,
        narrationStart: s(NARRATION_LEAD_IN_SEC),
        narrationFrames: s(narrationSec),
        visibleStart: 0,
      });
    }
  });

  const hasEndCard = spec.endCard.showSources || spec.endCard.showCredits;
  if (hasEndCard) {
    drafts.push({ kind: "end-card", key: "end-card", base: s(END_CARD_SEC), transition: CUT });
  }

  // The scene before the end card dips to black, the end card ends the film.
  const lastIndex = drafts.length - 1;
  if (hasEndCard && lastIndex > 0) drafts[lastIndex - 1].transition = DIP;
  drafts[lastIndex].transition = CUT;

  // 2. Transition lengths, clamped so they never exceed half of either neighbour.
  const tOut = drafts.map((d, i) => {
    const next = drafts[i + 1];
    if (!next) return 0;
    return Math.min(
      transitionFrames(d.transition, fps),
      Math.floor(d.base / 2),
      Math.floor(next.base / 2),
    );
  });

  // 3. In a TransitionSeries, neighbours overlap during a transition. Each segment
  //    is padded by its incoming AND outgoing transition, so its full `base`
  //    length is visible on its own (narration never plays under a dissolve).
  const segments: Segment[] = [];
  let cursor = 0;
  drafts.forEach((d, i) => {
    const tIn = i > 0 ? tOut[i - 1] : 0;
    const out = tOut[i];
    const transition: Transition = out === 0 ? CUT : { ...d.transition, durationSec: out / fps };

    const { base, ...rest } = d;
    const durationInFrames = tIn + base + out;
    const seg = { ...rest, transition, from: cursor, durationInFrames } as Segment;
    if (seg.kind === "scene") {
      seg.narrationStart += tIn;
      seg.visibleStart = tIn;
    }
    segments.push(seg);
    cursor += durationInFrames - out;
  });

  const last = segments[segments.length - 1];
  return { fps, segments, durationInFrames: last.from + last.durationInFrames };
}
