import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { RatioLayout } from "../layout";
import type { Theme } from "../theme";

type Props = {
  text: string;
  /** Narration window, in frames relative to the segment start. */
  start: number;
  frames: number;
  layout: RatioLayout;
  theme: Theme;
  style: "documentary-clean" | "bold-social";
};

type Word = { text: string; t0: number; t1: number };
type Chunk = { words: Word[]; t0: number; t1: number };

/**
 * Until TTS word timestamps exist, words are timed proportionally to their length,
 * which tracks real speech closely enough for caption display.
 */
function timeWords(text: string): Word[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const weights = tokens.map((w) => w.length + 3 + (/[.,;:!?]$/.test(w) ? 4 : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  return tokens.map((t, i) => {
    const t0 = acc / total;
    acc += weights[i];
    return { text: t, t0, t1: acc / total };
  });
}

function chunkWords(words: Word[], maxChars: number, maxWords: number): Chunk[] {
  const chunks: Chunk[] = [];
  let cur: Word[] = [];
  let len = 0;
  const flush = () => {
    if (cur.length) chunks.push({ words: cur, t0: cur[0].t0, t1: cur[cur.length - 1].t1 });
    cur = [];
    len = 0;
  };
  for (const w of words) {
    if (cur.length && (len + 1 + w.text.length > maxChars || cur.length >= maxWords)) flush();
    cur.push(w);
    len += (len ? 1 : 0) + w.text.length;
    // Prefer breaking after punctuation once the chunk has some substance.
    if (/[.,;:!?]$/.test(w.text) && len >= maxChars * 0.45) flush();
  }
  flush();
  return chunks;
}

export const Captions: React.FC<Props> = ({ text, start, frames, layout, theme, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bold = style === "bold-social";

  const chunks = useMemo(() => {
    const words = timeWords(text);
    return bold
      ? chunkWords(words, 22, 4)
      : chunkWords(words, layout.ratio === "16:9" ? 62 : 44, 12);
  }, [text, bold, layout.ratio]);

  if (!text.trim() || frames <= 0) return null;
  const t = (frame - start) / frames;
  if (t < 0 || t > 1.02) return null;

  const idx = chunks.findIndex((c) => t < c.t1);
  const chunk = chunks[idx === -1 ? chunks.length - 1 : idx];
  const chunkStartFrame = start + chunk.t0 * frames;
  const local = frame - chunkStartFrame;

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    left: (layout.width - layout.captionMaxWidth) / 2,
    width: layout.captionMaxWidth,
    bottom: layout.captionBottom,
    display: "flex",
    justifyContent: "center",
    textAlign: "center",
  };

  if (!bold) {
    const opacity = interpolate(local, [0, 4], [0, 1], { extrapolateRight: "clamp" });
    return (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div style={containerStyle}>
          <span
            style={{
              fontFamily: theme.captionFont,
              fontWeight: 500,
              fontSize: 44 * layout.type,
              lineHeight: 1.32,
              color: "#fff",
              background: "rgba(0,0,0,0.55)",
              padding: "10px 22px",
              borderRadius: 10,
              opacity,
              boxDecorationBreak: "clone",
              WebkitBoxDecorationBreak: "clone",
            }}
          >
            {chunk.words.map((w) => w.text).join(" ")}
          </span>
        </div>
      </AbsoluteFill>
    );
  }

  const pop = spring({ frame: local, fps, config: { damping: 14, stiffness: 220, mass: 0.6 } });
  const scale = interpolate(pop, [0, 1], [0.86, 1]);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ ...containerStyle, transform: `scale(${scale})`, transformOrigin: "50% 100%" }}>
        <div
          style={{
            fontFamily: theme.captionFont,
            fontWeight: 800,
            fontSize: 70 * layout.type,
            lineHeight: 1.12,
            letterSpacing: "-0.01em",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            columnGap: "0.26em",
          }}
        >
          {chunk.words.map((w, i) => {
            const active = t >= w.t0 && t < w.t1;
            return (
              <span
                key={i}
                style={{
                  color: active ? theme.accent : "#fff",
                  textShadow:
                    "0 0 2px #000, 0 0 2px #000, 0 3px 0 rgba(0,0,0,0.9), 0 6px 18px rgba(0,0,0,0.7), 3px 0 0 #000, -3px 0 0 #000, 0 -3px 0 #000",
                }}
              >
                {w.text}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
