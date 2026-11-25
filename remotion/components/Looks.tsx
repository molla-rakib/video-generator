import React from "react";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";

const NOISE_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1.1 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`,
);

/** Film grain: one static noise tile, jittered every frame (cheap to render). */
export const FilmGrain: React.FC<{ opacity?: number }> = ({ opacity = 0.09 }) => {
  const frame = useCurrentFrame();
  const x = Math.floor(random(`gx${frame}`) * 300);
  const y = Math.floor(random(`gy${frame}`) * 300);
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        backgroundImage: `url("data:image/svg+xml,${NOISE_SVG}")`,
        backgroundPosition: `${x}px ${y}px`,
        opacity,
        mixBlendMode: "overlay",
      }}
    />
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.5 }) => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background: `radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,${strength}) 100%)`,
    }}
  />
);

/** Shown on every AI-generated visual — never presented as real footage. */
export const IllustrationLabel: React.FC<{ top: number; right: number; fontFamily: string }> = ({ top, right, fontFamily }) => (
  <div
    style={{
      position: "absolute",
      top,
      right,
      fontFamily,
      fontWeight: 600,
      fontSize: 20,
      letterSpacing: "0.2em",
      color: "#fff",
      background: "rgba(0,0,0,0.6)",
      border: "1px solid rgba(255,255,255,0.35)",
      padding: "6px 12px",
      borderRadius: 4,
    }}
  >
    ILLUSTRATION
  </div>
);
