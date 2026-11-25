/**
 * HTML overlays on top of an animated scene: speech bubbles, titles, labels,
 * counters and timelines. HTML (not SVG) so text wraps and stays crisp.
 * All positions are in composition pixels.
 */
import React from "react";
import { Easing, interpolate, spring, useVideoConfig } from "remotion";
import type { AnimElement } from "../../lib/spec/animation";
import { CARTOON_FONT, type Theme } from "../theme";

const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function appear(t: number, at: number, duration: number | undefined, fps: number) {
  if (t < at) return 0;
  const inP = spring({ frame: (t - at) * fps, fps, config: { damping: 13, stiffness: 180, mass: 0.6 } });
  if (duration === undefined) return inP;
  const out = clamp01((at + duration - t) / 0.25);
  return Math.min(inP, out);
}

// ─── Speech bubble ──────────────────────────────────────────────────────────

export const SpeechBubble: React.FC<{
  el: Extract<AnimElement, { type: "speech" }>;
  t: number;
  /** Top of the speaker's head (px). */
  anchor: { x: number; y: number };
  facing: 1 | -1;
  frame: { w: number; h: number };
  px: number;
}> = ({ el, t, anchor, facing, frame, px }) => {
  const { fps } = useVideoConfig();
  const v = appear(t, el.at, el.duration, fps);
  if (v <= 0.001) return null;
  const words = el.text.split(/\s+/);
  const shown = Math.ceil(clamp01((t - el.at) / Math.max(0.6, el.duration * 0.45)) * words.length);

  const fs = 34 * px;
  const maxW = Math.min(440 * px, frame.w * 0.62);
  const estW = Math.min(maxW, Math.max(140 * px, el.text.length * fs * 0.52 + 44 * px));
  // Prefer the side the character faces; keep inside the frame.
  let left = facing === 1 ? anchor.x - 30 * px : anchor.x - estW + 30 * px;
  left = Math.max(16 * px, Math.min(frame.w - estW - 16 * px, left));
  const bottom = frame.h - anchor.y + 34 * px;
  const tailX = Math.max(24 * px, Math.min(estW - 24 * px, anchor.x - left));
  const thought = el.kind === "thought";
  const shout = el.kind === "shout";

  return (
    <div
      style={{
        position: "absolute",
        left,
        bottom,
        width: estW,
        transform: `scale(${0.6 + v * 0.4})`,
        transformOrigin: `${tailX}px 100%`,
        opacity: v,
      }}
    >
      <div
        style={{
          background: "#ffffff",
          color: "#1d1a2b",
          border: `${(shout ? 6 : 4) * px}px solid ${shout ? "#e63946" : "#1d1a2b"}`,
          borderRadius: thought ? 999 : 26 * px,
          padding: `${14 * px}px ${22 * px}px`,
          fontFamily: CARTOON_FONT,
          fontWeight: shout ? 700 : 600,
          fontSize: fs,
          lineHeight: 1.18,
          textAlign: "center",
          textTransform: shout ? "uppercase" : "none",
          boxShadow: `0 ${6 * px}px 0 rgba(0,0,0,0.18)`,
        }}
      >
        {words.map((w, i) => (
          <span key={i} style={{ opacity: i < shown ? 1 : 0 }}>
            {w}{" "}
          </span>
        ))}
      </div>
      {thought ? (
        <>
          <div style={{ position: "absolute", left: tailX - 12 * px, bottom: -24 * px, width: 20 * px, height: 20 * px, borderRadius: 99, background: "#fff", border: `${4 * px}px solid #1d1a2b` }} />
          <div style={{ position: "absolute", left: tailX - 2 * px, bottom: -42 * px, width: 12 * px, height: 12 * px, borderRadius: 99, background: "#fff", border: `${3 * px}px solid #1d1a2b` }} />
        </>
      ) : (
        <svg width={40 * px} height={34 * px} viewBox="0 0 40 34" style={{ position: "absolute", left: tailX - 20 * px, bottom: -28 * px }}>
          <path d={facing === 1 ? "M 6 0 L 14 32 L 34 0 Z" : "M 6 0 L 26 32 L 34 0 Z"} fill="#fff" stroke={shout ? "#e63946" : "#1d1a2b"} strokeWidth={4} />
          <rect x={4} y={-6} width={32} height={9} fill="#fff" />
        </svg>
      )}
    </div>
  );
};

// ─── Text / counter / timeline ──────────────────────────────────────────────

const outlineText = (px: number, color = "#16131f") =>
  [`0 ${5 * px}px 0 ${color}`, `${3 * px}px 0 0 ${color}`, `-${3 * px}px 0 0 ${color}`, `0 -${3 * px}px 0 ${color}`, `0 ${3 * px}px 0 ${color}`].join(", ");

export const TextOverlay: React.FC<{ el: Extract<AnimElement, { type: "text" }>; t: number; pos: { x: number; y: number }; px: number; theme: Theme; frameW: number }> = ({
  el,
  t,
  pos,
  px,
  theme,
  frameW,
}) => {
  const { fps } = useVideoConfig();
  const v = appear(t, el.at, el.duration, fps);
  if (v <= 0.001) return null;
  const base: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: pos.y,
    width: frameW,
    display: "flex",
    justifyContent: "center",
    transform: `translate(${pos.x - frameW / 2}px, -50%) scale(${0.5 + v * 0.5})`,
    transformOrigin: `${pos.x}px 50%`,
    opacity: v,
    pointerEvents: "none",
  };
  switch (el.style) {
    case "title":
      return (
        <div style={base}>
          <div style={{ fontFamily: theme.headingFont, fontWeight: 700, fontSize: 84 * px, color: "#fff", textShadow: outlineText(px), textAlign: "center", maxWidth: frameW * 0.86, lineHeight: 1.05 }}>{el.text}</div>
        </div>
      );
    case "year":
      return (
        <div style={base}>
          <div style={{ fontFamily: CARTOON_FONT, fontWeight: 700, fontSize: 150 * px, color: theme.accent, textShadow: outlineText(px * 1.4), letterSpacing: "0.02em" }}>{el.text}</div>
        </div>
      );
    case "caption":
      return (
        <div style={base}>
          <div style={{ fontFamily: CARTOON_FONT, fontWeight: 600, fontSize: 40 * px, color: "#fff", background: "rgba(22,19,31,0.78)", padding: `${10 * px}px ${22 * px}px`, borderRadius: 16 * px, maxWidth: frameW * 0.8, textAlign: "center" }}>
            {el.text}
          </div>
        </div>
      );
    default:
      return (
        <div style={base}>
          <div style={{ fontFamily: CARTOON_FONT, fontWeight: 700, fontSize: 36 * px, color: "#16131f", background: theme.accent, padding: `${8 * px}px ${20 * px}px`, borderRadius: 999, border: `${4 * px}px solid #16131f`, whiteSpace: "nowrap" }}>
            {el.text}
          </div>
        </div>
      );
  }
};

export const CounterOverlay: React.FC<{ el: Extract<AnimElement, { type: "counter" }>; t: number; pos: { x: number; y: number }; px: number; theme: Theme; frameW: number }> = ({
  el,
  t,
  pos,
  px,
  theme,
  frameW,
}) => {
  const { fps } = useVideoConfig();
  const v = appear(t, el.at, undefined, fps);
  if (v <= 0.001) return null;
  const k = interpolate(t, [el.at, el.at + 1.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const value = (el.value * k).toLocaleString("en-US", { minimumFractionDigits: el.decimals, maximumFractionDigits: el.decimals });
  return (
    <div style={{ position: "absolute", left: pos.x - frameW / 2, top: pos.y, width: frameW, transform: `translateY(-50%) scale(${0.6 + v * 0.4})`, opacity: v, textAlign: "center" }}>
      <div style={{ fontFamily: CARTOON_FONT, fontWeight: 700, fontSize: 150 * px, lineHeight: 1, color: "#fff", textShadow: outlineText(px * 1.4), fontVariantNumeric: "tabular-nums" }}>
        <span style={{ color: theme.accent }}>{el.prefix}</span>
        {value}
        <span style={{ color: theme.accent, fontSize: "0.5em" }}>{el.suffix}</span>
      </div>
      <div
        style={{
          display: "inline-block",
          marginTop: 14 * px,
          fontFamily: CARTOON_FONT,
          fontWeight: 600,
          fontSize: 38 * px,
          color: "#fff",
          background: "rgba(22,19,31,0.72)",
          padding: `${8 * px}px ${20 * px}px`,
          borderRadius: 14 * px,
          maxWidth: frameW * 0.84,
          opacity: clamp01((t - el.at - 0.5) / 0.4),
        }}
      >
        {el.label}
      </div>
    </div>
  );
};

export const TimelineOverlay: React.FC<{ el: Extract<AnimElement, { type: "timeline" }>; t: number; y: number; px: number; theme: Theme; frameW: number; portrait: boolean }> = ({
  el,
  t,
  y,
  px,
  theme,
  frameW,
  portrait,
}) => {
  const left = frameW * 0.08;
  const width = frameW * 0.84;
  const n = el.events.length;
  const lineP = interpolate(t, [el.at, el.at + el.step * (n - 1) + 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  if (t < el.at) return null;
  const fsLabel = (portrait ? 34 : 44) * px;
  const fsCap = (portrait ? 22 : 28) * px;
  return (
    <div style={{ position: "absolute", left, top: y, width, height: 0 }}>
      <div style={{ position: "absolute", left: 0, top: -5 * px, height: 10 * px, width: "100%", borderRadius: 99, background: "rgba(22,19,31,0.35)" }} />
      <div style={{ position: "absolute", left: 0, top: -5 * px, height: 10 * px, width: `${lineP * 100}%`, borderRadius: 99, background: theme.accent, boxShadow: `0 0 0 ${3 * px}px #16131f` }} />
      {el.events.map((ev, i) => {
        const at = el.at + i * el.step;
        const s = t < at ? 0 : spring({ frame: (t - at) * 30, fps: 30, config: { damping: 12, mass: 0.6 } });
        const x = n === 1 ? width / 2 : (i / (n - 1)) * width;
        const up = i % 2 === 0;
        return (
          <div key={i} style={{ position: "absolute", left: x, top: 0, opacity: Math.min(1, s * 1.5) }}>
            <div style={{ position: "absolute", left: -16 * px, top: -16 * px, width: 32 * px, height: 32 * px, borderRadius: 99, background: "#fff", border: `${6 * px}px solid #16131f`, transform: `scale(${s})` }} />
            <div
              style={{
                position: "absolute",
                left: -150 * px,
                width: 300 * px,
                textAlign: "center",
                ...(up ? { bottom: 30 * px } : { top: 30 * px }),
                transform: `translateY(${(1 - s) * (up ? 20 : -20) * px}px)`,
              }}
            >
              <div style={{ fontFamily: CARTOON_FONT, fontWeight: 700, fontSize: fsLabel, color: "#fff", textShadow: outlineText(px * 0.9), lineHeight: 1 }}>{ev.label}</div>
              <div style={{ fontFamily: CARTOON_FONT, fontWeight: 600, fontSize: fsCap, color: "#fff", marginTop: 4 * px, textShadow: `0 ${2 * px}px ${6 * px}px rgba(0,0,0,0.8)`, lineHeight: 1.15 }}>{ev.caption}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
