/**
 * SUBTITLES (SRT / VTT)
 *
 * The subtitle file is one of the two inputs of every video: it gives the
 * words and their exact timing. ElevenLabs voice tags that leak into
 * subtitles — "[happy]", "[whispers]", "[Dramatically]" — are taken out of
 * the text and kept as emotion hints for the animator.
 */

export interface SubtitleCue {
  index: number;
  /** Seconds. */
  start: number;
  end: number;
  /** Clean text, tags removed. */
  text: string;
  /** Emotion/delivery tags found in this cue, lower-case, e.g. ["happy"]. */
  tags: string[];
}

export interface ParsedSubtitles {
  cues: SubtitleCue[];
  /** Every tag with the time it applies from. */
  emotionHints: Array<{ atSec: number; tag: string }>;
  warnings: string[];
}

export class SubtitleParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubtitleParseError";
  }
}

const TIME = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;
const ARROW = new RegExp(`${TIME.source}\\s*-->\\s*${TIME.source}`);

function seconds(h: string | undefined, m: string, s: string, ms: string): number {
  return Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;
}

/** "[happy] Hello <i>there</i>" → { text: "Hello there", tags: ["happy"] } */
export function cleanCueText(raw: string): { text: string; tags: string[] } {
  const tags: string[] = [];
  let text = raw
    .replace(/<[^>]+>/g, "") // VTT/SRT styling tags
    .replace(/\{\\[^}]*\}/g, ""); // SSA-style overrides
  text = text.replace(/\[([^\]\n]{1,40})\]/g, (_, tag: string) => {
    tags.push(tag.trim().toLowerCase());
    return " ";
  });
  // A tag split across lines/cues leaves a dangling "[happ" or "y]".
  text = text.replace(/\[[^\]\n]{0,40}$/g, " ").replace(/^[^[\n]{0,40}\]/g, " ");
  text = text.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  return { text, tags };
}

/** Parse SRT or WebVTT text into clean, ordered, non-overlapping cues. */
export function parseSubtitles(input: string): ParsedSubtitles {
  const source = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const blocks = source.split(/\n{2,}/);
  const raw: Array<{ start: number; end: number; text: string }> = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const timeLine = lines.findIndex((l) => ARROW.test(l));
    if (timeLine === -1) continue;
    const m = ARROW.exec(lines[timeLine]!)!;
    const start = seconds(m[1], m[2]!, m[3]!, m[4]!);
    const end = seconds(m[5], m[6]!, m[7]!, m[8]!);
    raw.push({ start, end, text: lines.slice(timeLine + 1).join("\n") });
  }
  if (raw.length === 0) throw new SubtitleParseError("No subtitles were found in this file. Use an SRT or VTT file with timed lines.");

  raw.sort((a, b) => a.start - b.start);
  const warnings: string[] = [];
  const cues: SubtitleCue[] = [];
  const emotionHints: ParsedSubtitles["emotionHints"] = [];
  let pendingTags: string[] = [];
  for (const r of raw) {
    const { text, tags } = cleanCueText(r.text);
    if (r.end <= r.start) {
      warnings.push(`A subtitle at ${r.start.toFixed(2)} s ends before it starts; it was skipped.`);
      continue;
    }
    for (const tag of tags) emotionHints.push({ atSec: round(r.start), tag });
    if (!text) {
      // A cue that held only a tag: carry it to the next spoken line.
      pendingTags = [...pendingTags, ...tags];
      continue;
    }
    const prev = cues.at(-1);
    let start = r.start;
    if (prev && start < prev.end) {
      // Overlapping cues: end the previous one where this starts.
      prev.end = Math.max(prev.start + 0.05, start);
      if (prev.end > start) start = prev.end;
    }
    cues.push({ index: cues.length + 1, start: round(start), end: round(r.end), text, tags: [...pendingTags, ...tags] });
    pendingTags = [];
  }
  if (cues.length === 0) throw new SubtitleParseError("The subtitle file has timings but no text.");
  return { cues, emotionHints, warnings };
}

const round = (n: number) => Math.round(n * 1000) / 1000;
