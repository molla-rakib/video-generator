import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Overlay } from "../../lib/spec/schema";
import type { RatioLayout } from "../layout";
import type { Theme } from "../theme";

type Props = {
  overlays: Overlay[];
  layout: RatioLayout;
  theme: Theme;
  /** Frame (relative to segment) when overlays may start appearing. */
  start: number;
  /** Frame (relative to segment) when overlays must be gone. */
  end: number;
  /** Extra space reserved at the bottom for captions. */
  captionSpace: number;
};

const ease = Easing.bezier(0.2, 0.8, 0.2, 1);

/** Animates in after `delay`, holds, animates out before `end`. Returns 0..1. */
function useInOut(start: number, end: number, delay: number, hold: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inAt = start + delay;
  const outAt = Math.min(inAt + hold * fps, end - 12);
  if (outAt <= inAt + 12) return 0;
  return Math.min(
    interpolate(frame, [inAt, inAt + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease }),
    interpolate(frame, [outAt, outAt + 12], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease }),
  );
}

/** Typewriter-style stamp for dates and places. */
const Stamp: React.FC<{ text: string; icon?: "pin"; theme: Theme; layout: RatioLayout; start: number; end: number; delay: number }> = ({
  text,
  icon,
  theme,
  layout,
  start,
  end,
  delay,
}) => {
  const frame = useCurrentFrame();
  const v = useInOut(start, end, delay, 4.5);
  const typed = Math.floor(interpolate(frame, [start + delay, start + delay + text.length * 1.4], [0, text.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  if (v <= 0) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        opacity: v,
        fontFamily: theme.bodyFont,
        fontWeight: 600,
        fontSize: 26 * layout.type,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: theme.text,
        textShadow: "0 2px 10px rgba(0,0,0,0.85)",
      }}
    >
      {icon === "pin" ? (
        <svg width={22 * layout.type} height={22 * layout.type} viewBox="0 0 24 24" fill={theme.accent}>
          <path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
        </svg>
      ) : (
        <span style={{ width: 28 * layout.type, height: 3, background: theme.accent, display: "inline-block" }} />
      )}
      <span>{text.slice(0, typed)}</span>
    </div>
  );
};

const LowerThird: React.FC<{ title: string; subtitle?: string; theme: Theme; layout: RatioLayout; start: number; end: number }> = ({
  title,
  subtitle,
  theme,
  layout,
  start,
  end,
}) => {
  const v = useInOut(start, end, 18, 5);
  if (v <= 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 18, transform: `translateX(${(1 - v) * -40}px)`, opacity: v }}>
      <div style={{ width: 6, background: theme.accent, borderRadius: 3, transform: `scaleY(${v})`, transformOrigin: "top" }} />
      <div
        style={{
          background: theme.panel,
          padding: `${14 * layout.type}px ${26 * layout.type}px`,
          borderRadius: 6,
          backdropFilter: "blur(6px)",
          maxWidth: layout.width - layout.safe.left - layout.safe.right - 40,
        }}
      >
        <div
          style={{
            fontFamily: theme.headingFont,
            fontWeight: theme.headingWeight,
            textTransform: theme.headingTransform,
            letterSpacing: theme.headingTracking,
            fontSize: 50 * layout.type,
            lineHeight: 1.05,
            color: theme.text,
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div style={{ fontFamily: theme.bodyFont, fontWeight: 500, fontSize: 26 * layout.type, color: theme.muted, marginTop: 6 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
};

/**
 * Places documentary overlays inside the ratio's safe zone:
 * - date + location stamps: top-left
 * - lower-third: bottom-left above captions (16:9, 1:1, 4:5) or under the stamps (9:16)
 */
export const Overlays: React.FC<Props> = ({ overlays, layout, theme, start, end, captionSpace }) => {
  const stamps = overlays.filter((o) => o.type === "date" || o.type === "location");
  const lowerThirds = overlays.filter((o) => o.type === "lower-third");

  const stampEls = stamps.map((o, i) => (
    <Stamp
      key={`s${i}`}
      text={o.text}
      icon={o.type === "location" ? "pin" : undefined}
      theme={theme}
      layout={layout}
      start={start}
      end={end}
      delay={6 + i * 16}
    />
  ));
  const ltEls = lowerThirds.map((o, i) => (
    <LowerThird key={`l${i}`} title={o.title} subtitle={o.subtitle} theme={theme} layout={layout} start={start} end={end} />
  ));

  const { safe } = layout;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {layout.lowerThird === "top-left" ? (
        <div style={{ position: "absolute", top: safe.top, left: safe.left, display: "flex", flexDirection: "column", gap: 14 }}>
          {stampEls}
          {ltEls.length ? <div style={{ marginTop: 10 }}>{ltEls}</div> : null}
        </div>
      ) : (
        <>
          <div style={{ position: "absolute", top: safe.top, left: safe.left, display: "flex", flexDirection: "column", gap: 14 }}>
            {stampEls}
          </div>
          <div style={{ position: "absolute", bottom: Math.max(safe.bottom, captionSpace), left: safe.left }}>{ltEls}</div>
        </>
      )}
    </AbsoluteFill>
  );
};
