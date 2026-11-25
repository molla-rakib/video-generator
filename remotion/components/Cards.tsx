import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { MediaItem } from "../../lib/spec/schema";
import type { RatioLayout } from "../layout";
import type { Theme } from "../theme";
import { shade } from "../anim/art";
import { KenBurnsPhoto } from "./KenBurnsPhoto";

const ease = Easing.bezier(0.2, 0.8, 0.2, 1);

/** Centered cards use equal side padding, so they stay visually centered even when the safe zone is asymmetric (9:16). */
const sideX = (layout: RatioLayout) => Math.max(layout.safe.left, layout.safe.right);
const fadeUp = (frame: number, at: number, dist = 30) => ({
  opacity: interpolate(frame, [at, at + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  transform: `translateY(${interpolate(frame, [at, at + 24], [dist, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease })}px)`,
});

const headingStyle = (theme: Theme, size: number): React.CSSProperties => ({
  fontFamily: theme.headingFont,
  fontWeight: theme.headingWeight,
  textTransform: theme.headingTransform,
  letterSpacing: theme.headingTracking,
  fontSize: size,
  lineHeight: 1.04,
  color: theme.text,
  textWrap: "balance",
});

const Backdrop: React.FC<{ media?: MediaItem; durationInFrames: number; dim?: number; filter?: string }> = ({
  media,
  durationInFrames,
  dim = 0.62,
  filter,
}) =>
  media ? (
    <>
      <KenBurnsPhoto media={media} motion="push-in" fit="cover" durationInFrames={durationInFrames} filter={filter} />
      <AbsoluteFill style={{ background: `rgba(0,0,0,${dim})` }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%)" }} />
    </>
  ) : null;

// ─── Opening title ──────────────────────────────────────────────────────────

export const OpeningCard: React.FC<{
  title: string;
  subtitle?: string;
  media?: MediaItem;
  theme: Theme;
  layout: RatioLayout;
  durationInFrames: number;
  filter?: string;
  /** Custom backdrop (e.g. an animated scene) instead of a photo. */
  backdrop?: React.ReactNode;
}> = ({ title, subtitle, media, theme, layout, durationInFrames, filter, backdrop }) => {
  const frame = useCurrentFrame();
  const line = interpolate(frame, [20, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const size = (layout.portrait ? 112 : 128) * layout.type;
  return (
    <AbsoluteFill style={{ background: theme.background }}>
      {backdrop ? (
        <>
          {backdrop}
          <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(10,8,30,0.35) 0%, rgba(10,8,30,0.7) 100%)" }} />
        </>
      ) : (
        <Backdrop media={media} durationInFrames={durationInFrames} dim={0.55} filter={filter} />
      )}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: `${layout.safe.top}px ${sideX(layout)}px ${layout.safe.bottom}px`,
          textAlign: "center",
        }}
      >
        <div style={{ ...headingStyle(theme, size), ...fadeUp(frame, 6) }}>{title}</div>
        <div style={{ width: 160 * line, height: 3, background: theme.accent, margin: "34px 0 26px" }} />
        {subtitle ? (
          <div
            style={{
              fontFamily: theme.bodyFont,
              fontWeight: 500,
              fontSize: 34 * layout.type,
              color: theme.muted,
              letterSpacing: "0.06em",
              maxWidth: 1100,
              ...fadeUp(frame, 26, 16),
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── Chapter title ──────────────────────────────────────────────────────────

const NUMBER_WORDS = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];

export const ChapterCard: React.FC<{ index: number; title: string; theme: Theme; layout: RatioLayout }> = ({ index, title, theme, layout }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 90], [1.04, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 40%, ${shade(theme.background, 0.14)} 0%, ${theme.background} 70%)`,
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        padding: `0 ${sideX(layout)}px`,
      }}
    >
      <div style={{ transform: `scale(${scale})` }}>
        <div
          style={{
            fontFamily: theme.bodyFont,
            fontWeight: 600,
            fontSize: 26 * layout.type,
            letterSpacing: "0.42em",
            textTransform: "uppercase",
            color: theme.accent,
            marginBottom: 26,
            ...fadeUp(frame, 4, 12),
          }}
        >
          Chapter {NUMBER_WORDS[index] ?? index + 1}
        </div>
        <div style={{ ...headingStyle(theme, (layout.portrait ? 96 : 110) * layout.type), ...fadeUp(frame, 12) }}>{title}</div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Quote ──────────────────────────────────────────────────────────────────

export const QuoteCard: React.FC<{
  text: string;
  attribution: string;
  media?: MediaItem;
  theme: Theme;
  layout: RatioLayout;
  durationInFrames: number;
  /** Space kept free at the bottom (captions). */
  reserveBottom: number;
  filter?: string;
}> = ({ text, attribution, media, theme, layout, durationInFrames, reserveBottom, filter }) => {
  const frame = useCurrentFrame();
  const words = text.split(/\s+/);
  const perWord = Math.min(4, (durationInFrames * 0.45) / words.length);
  const size = (text.length > 110 ? 58 : 72) * layout.type * (layout.ratio === "16:9" ? 1 : 0.9);
  return (
    <AbsoluteFill style={{ background: theme.background }}>
      <Backdrop media={media} durationInFrames={durationInFrames} dim={0.7} filter={`blur(3px) ${filter ?? ""}`} />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: `${layout.safe.top}px ${sideX(layout) + 40}px ${Math.max(layout.safe.bottom, reserveBottom)}px`,
        }}
      >
        <div style={{ maxWidth: 1400, textAlign: "center" }}>
          <div
            style={{
              fontFamily: theme.quoteFont,
              fontSize: 200 * layout.type,
              lineHeight: 0.6,
              color: theme.accent,
              height: 90 * layout.type,
              ...fadeUp(frame, 0, 10),
            }}
          >
            “
          </div>
          <div
            style={{
              fontFamily: theme.quoteFont,
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: size * 1.1,
              lineHeight: 1.18,
              color: theme.text,
              textWrap: "balance",
            }}
          >
            {words.map((w, i) => (
              <span
                key={i}
                style={{
                  opacity: interpolate(frame, [8 + i * perWord, 8 + i * perWord + 10], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                }}
              >
                {w}{" "}
              </span>
            ))}
          </div>
          <div
            style={{
              fontFamily: theme.bodyFont,
              fontWeight: 600,
              fontSize: 28 * layout.type,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: theme.muted,
              marginTop: 40,
              ...fadeUp(frame, 8 + words.length * perWord, 10),
            }}
          >
            — {attribution}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── Animated statistic ─────────────────────────────────────────────────────

export const StatCard: React.FC<{
  value: number;
  decimals: number;
  prefix: string;
  suffix: string;
  label: string;
  media?: MediaItem;
  theme: Theme;
  layout: RatioLayout;
  durationInFrames: number;
  start: number;
  /** Space kept free at the bottom (captions). */
  reserveBottom: number;
  filter?: string;
}> = ({ value, decimals, prefix, suffix, label, media, theme, layout, durationInFrames, start, reserveBottom, filter }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = interpolate(frame, [start, start + 1.6 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const pop = spring({ frame: frame - start, fps, config: { damping: 16, mass: 0.7 } });
  const shown = (value * p).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const numberSize = (layout.portrait ? 150 : 180) * layout.type * (shown.length + prefix.length + suffix.length > 12 ? 0.75 : 1);
  return (
    <AbsoluteFill style={{ background: theme.background }}>
      <Backdrop media={media} durationInFrames={durationInFrames} dim={0.72} filter={filter} />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          padding: `${layout.safe.top}px ${sideX(layout)}px ${Math.max(layout.safe.bottom, reserveBottom)}px`,
        }}
      >
        <div
          style={{
            ...headingStyle(theme, numberSize),
            fontVariantNumeric: "lining-nums tabular-nums",
            color: theme.text,
            transform: `scale(${interpolate(pop, [0, 1], [0.9, 1])})`,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ color: theme.accent }}>{prefix}</span>
          {shown}
          <span style={{ color: theme.accent, fontSize: "0.55em", textTransform: "none", letterSpacing: "0.02em" }}>{suffix}</span>
        </div>
        <div
          style={{
            fontFamily: theme.bodyFont,
            fontWeight: 500,
            fontSize: 36 * layout.type,
            color: theme.muted,
            marginTop: 18,
            maxWidth: 900,
            textWrap: "balance",
            ...fadeUp(frame, start + 20, 14),
          }}
        >
          {label}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── Sources & credits end card ─────────────────────────────────────────────

export type CreditLine = { primary: string; secondary: string };

const CreditSection: React.FC<{
  heading: string;
  items: CreditLine[];
  delay: number;
  base: number;
  theme: Theme;
  layout: RatioLayout;
}> = ({ heading, items, delay, base, theme, layout }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ flex: 1, minWidth: 0, ...fadeUp(frame, delay, 16) }}>
      <div
        style={{
          fontFamily: theme.bodyFont,
          fontWeight: 600,
          fontSize: 22 * layout.type,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: theme.accent,
          marginBottom: 18 * base,
        }}
      >
        {heading}
      </div>
      {items.map((it, i) => (
        <div key={i} style={{ marginBottom: 16 * base }}>
          <div style={{ fontFamily: theme.bodyFont, fontWeight: 600, fontSize: 26 * base, color: theme.text, lineHeight: 1.25 }}>{it.primary}</div>
          <div style={{ fontFamily: theme.bodyFont, fontWeight: 400, fontSize: 21 * base, color: theme.muted, lineHeight: 1.3, wordBreak: "break-word" }}>
            {it.secondary}
          </div>
        </div>
      ))}
    </div>
  );
};

export const EndCard: React.FC<{
  title: string;
  sources: CreditLine[];
  credits: CreditLine[];
  theme: Theme;
  layout: RatioLayout;
  durationInFrames: number;
}> = ({ title, sources, credits, theme, layout, durationInFrames }) => {
  const frame = useCurrentFrame();
  const columns = layout.ratio === "16:9" ? 2 : 1;
  const lines = sources.length + credits.length;
  const density = columns === 2 ? Math.max(sources.length, credits.length) : lines;
  const base = Math.min(1, 9 / Math.max(9, density)) * layout.type;
  const fade = interpolate(frame, [durationInFrames - 20, durationInFrames - 2], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        background: theme.background,
        padding: `${layout.safe.top + 20}px ${layout.safe.right}px ${layout.safe.bottom}px ${layout.safe.left}px`,
        opacity: fade,
      }}
    >
      <div style={{ ...headingStyle(theme, 54 * layout.type), marginBottom: 36 * base, ...fadeUp(frame, 0, 12) }}>{title}</div>
      <div style={{ display: "flex", flexDirection: columns === 2 ? "row" : "column", gap: columns === 2 ? 80 : 28 * base }}>
        {sources.length ? (
          <CreditSection heading="Sources" items={sources} delay={10} base={base} theme={theme} layout={layout} />
        ) : null}
        {credits.length ? (
          <CreditSection heading="Media credits" items={credits} delay={22} base={base} theme={theme} layout={layout} />
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
