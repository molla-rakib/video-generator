import React from "react";
import { random } from "remotion";
import type { EFFECTS } from "../../lib/spec/animation";
import type { World } from "./world";

type EffectName = (typeof EFFECTS)[number];

/** Particle effects, drawn in screen space (unaffected by the camera). */
export const Effect: React.FC<{ name: EffectName; t: number; world: World; intensity: number; opacity: number }> = ({
  name,
  t,
  world,
  intensity,
  opacity,
}) => {
  const { W, H, groundY: G } = world;
  const n = (base: number) => Math.round(base * intensity);
  const R = (k: string) => random(`${name}-${k}`);

  let content: React.ReactNode = null;
  switch (name) {
    case "rain":
      content = Array.from({ length: n(140) }, (_, i) => {
        const speed = 900 + R(`s${i}`) * 500;
        const x = R(`x${i}`) * (W + 300) - 150 + ((t * speed * 0.25) % 300);
        const y = ((R(`y${i}`) * (H + 200) + t * speed) % (H + 200)) - 100;
        return <line key={i} x1={x} y1={y} x2={x - 10} y2={y + 34} stroke="#cfe6ff" strokeWidth={3} opacity={0.6} strokeLinecap="round" />;
      });
      break;
    case "snow":
      content = Array.from({ length: n(110) }, (_, i) => {
        const speed = 50 + R(`s${i}`) * 80;
        const x = R(`x${i}`) * W + Math.sin(t * 1.2 + i) * 30;
        const y = ((R(`y${i}`) * (H + 40) + t * speed) % (H + 40)) - 20;
        return <circle key={i} cx={x} cy={y} r={3 + R(`r${i}`) * 5} fill="#fff" opacity={0.85} />;
      });
      break;
    case "confetti": {
      const colors = ["#ff6b81", "#ffd23f", "#5cc8ff", "#7bed9f", "#a29bfe", "#ff9f43"];
      content = Array.from({ length: n(120) }, (_, i) => {
        const speed = 260 + R(`s${i}`) * 260;
        const x = R(`x${i}`) * W + Math.sin(t * 3 + i) * 40;
        const y = -40 - R(`y${i}`) * H * 0.6 + t * speed;
        const rot = t * (200 + R(`r${i}`) * 400) + i * 40;
        return <rect key={i} x={-7} y={-12} width={14} height={24} rx={3} fill={colors[i % colors.length]} transform={`translate(${x} ${y}) rotate(${rot}) scale(1 ${Math.cos(t * 6 + i)})`} />;
      });
      break;
    }
    case "sparkles":
    case "stars":
      content = Array.from({ length: n(name === "stars" ? 40 : 26) }, (_, i) => {
        const period = 1.6 + R(`p${i}`) * 1.4;
        const phase = ((t + R(`o${i}`) * period) % period) / period;
        const s = Math.sin(phase * Math.PI);
        const x = R(`x${i}`) * W;
        const y = R(`y${i}`) * (name === "stars" ? G * 0.7 : H * 0.85);
        const size = (name === "stars" ? 10 : 18) * (0.6 + R(`z${i}`) * 0.8) * s;
        return (
          <path
            key={i}
            d={`M ${x} ${y - size * 2} Q ${x} ${y} ${x + size * 2} ${y} Q ${x} ${y} ${x} ${y + size * 2} Q ${x} ${y} ${x - size * 2} ${y} Q ${x} ${y} ${x} ${y - size * 2} Z`}
            fill={name === "stars" ? "#fffbe0" : "#fff3a6"}
            opacity={0.9}
          />
        );
      });
      break;
    case "dust":
      content = Array.from({ length: n(60) }, (_, i) => {
        const life = 3 + R(`l${i}`) * 2;
        const k = ((t + R(`o${i}`) * life) % life) / life;
        const x = R(`x${i}`) * W + Math.sin(t + i) * 20;
        const y = G + 20 - k * 260;
        return <circle key={i} cx={x} cy={y} r={2 + R(`r${i}`) * 4} fill="#f3e2c0" opacity={(1 - k) * 0.7} />;
      });
      break;
    case "smoke":
      content = Array.from({ length: n(26) }, (_, i) => {
        const life = 3.5;
        const k = ((t + (i / 26) * life) % life) / life;
        const side = i % 2 === 0 ? -1 : 1;
        const x = W / 2 + side * (40 + k * 420 * (0.5 + R(`x${i}`)));
        const y = G - 20 - k * 120;
        return <circle key={i} cx={x} cy={y} r={50 + k * 150} fill="#eceff3" opacity={(1 - k) * 0.75} />;
      });
      break;
    case "fireflies":
      content = Array.from({ length: n(36) }, (_, i) => {
        const x = R(`x${i}`) * W + Math.sin(t * 0.7 + i) * 50;
        const y = G * 0.35 + R(`y${i}`) * G * 0.6 + Math.cos(t * 0.9 + i * 2) * 30;
        const glow = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i));
        return (
          <g key={i} opacity={glow}>
            <circle cx={x} cy={y} r={16} fill="#fff59d" opacity={0.25} />
            <circle cx={x} cy={y} r={5} fill="#fffde7" />
          </g>
        );
      });
      break;
    case "bubbles":
      content = Array.from({ length: n(40) }, (_, i) => {
        const speed = 60 + R(`s${i}`) * 90;
        const x = R(`x${i}`) * W + Math.sin(t * 2 + i) * 14;
        const y = H - ((R(`y${i}`) * H + t * speed) % (H + 60));
        const r = 6 + R(`r${i}`) * 14;
        return <circle key={i} cx={x} cy={y} r={r} fill="rgba(255,255,255,0.15)" stroke="#e8f7ff" strokeWidth={2} />;
      });
      break;
  }
  return <g opacity={opacity}>{content}</g>;
};

const NOISE = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="260"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0.9 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`,
);

/** Paper texture for the storybook art style (static, so it reads as paper rather than film). */
export const PaperTexture: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      backgroundImage: `url("data:image/svg+xml,${NOISE}")`,
      mixBlendMode: "multiply",
      opacity: 0.16,
    }}
  />
);
