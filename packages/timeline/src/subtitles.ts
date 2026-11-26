import type { SubtitleCue } from "./script";

export interface TimedWord {
  start: number;
  end: number;
  word: string;
}

export interface TimedSegment {
  start: number;
  end: number;
  text: string;
}

const SENTENCE_END = /[।.!?]["”’)]?$/;

/**
 * Turn transcription timings into readable subtitle cues.
 *
 * With word timings, words are grouped into lines of at most `maxChars`
 * characters and `maxSeconds` seconds, breaking early at sentence ends
 * (including the Bangla dari "।"). Without word timings, long segments are
 * split proportionally by length.
 */
export function buildSubtitleCues(
  words: TimedWord[],
  segments: TimedSegment[],
  options: { maxChars?: number; maxSeconds?: number } = {},
): SubtitleCue[] {
  const maxChars = options.maxChars ?? 48;
  const maxSeconds = options.maxSeconds ?? 5;
  const cues: SubtitleCue[] = [];

  const usable = words.filter((w) => w.word.trim() && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start);
  if (usable.length > 0) {
    let current: TimedWord[] = [];
    const flush = () => {
      if (current.length === 0) return;
      cues.push({
        start: current[0]!.start,
        end: current[current.length - 1]!.end,
        text: current.map((w) => w.word.trim()).join(" "),
      });
      current = [];
    };
    for (const w of usable) {
      const text = [...current, w].map((x) => x.word.trim()).join(" ");
      const span = w.end - (current[0]?.start ?? w.start);
      if (current.length > 0 && (text.length > maxChars || span > maxSeconds)) flush();
      current.push(w);
      if (SENTENCE_END.test(w.word.trim())) flush();
    }
    flush();
    return cues;
  }

  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;
    if (text.length <= maxChars && seg.end - seg.start <= maxSeconds) {
      cues.push({ start: seg.start, end: seg.end, text });
      continue;
    }
    // Split at spaces into roughly equal lines, timing by character share.
    const parts: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      if ((line + " " + word).trim().length > maxChars && line) {
        parts.push(line);
        line = word;
      } else line = (line + " " + word).trim();
    }
    if (line) parts.push(line);
    const total = parts.reduce((n, p) => n + p.length, 0);
    let t = seg.start;
    for (const p of parts) {
      const d = ((seg.end - seg.start) * p.length) / total;
      cues.push({ start: t, end: t + d, text: p });
      t += d;
    }
  }
  return cues;
}
