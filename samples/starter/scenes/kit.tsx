import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Shared helpers for the sample scenes.
 *
 * Scenes are drawn once on a 1920×1080 "world". <Stage> frames that world
 * for whatever shape is being rendered (16:9, 9:16, 4:5, 1:1): it covers
 * the frame and keeps the point of interest (focusX/focusY) in view, so a
 * vertical export is re-framed instead of squeezed.
 */

export const WORLD = { width: 1920, height: 1080 };

export const Stage: React.FC<{
  focusX?: number;
  focusY?: number;
  /** Extra camera zoom (1 = just covering the frame). */
  zoom?: number;
  background?: string;
  children: React.ReactNode;
}> = ({ focusX = 0.5, focusY = 0.5, zoom = 1, background = "#000", children }) => {
  const { width, height } = useVideoConfig();
  const scale = Math.max(width / WORLD.width, height / WORLD.height) * zoom;
  const w = WORLD.width * scale;
  const h = WORLD.height * scale;
  // Put the focus point at the frame centre, without showing outside the world.
  const left = Math.min(0, Math.max(width - w, width / 2 - focusX * w));
  const top = Math.min(0, Math.max(height - h, height / 2 - focusY * h));
  return (
    <AbsoluteFill style={{ background, overflow: "hidden" }}>
      <div style={{ position: "absolute", left, top, width: WORLD.width, height: WORLD.height, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        {children}
      </div>
    </AbsoluteFill>
  );
};

/** Is the frame taller than it is wide? */
export function useVertical(): boolean {
  const { width, height } = useVideoConfig();
  return height > width;
}

/** 0 → 1 over the first `seconds` of the scene, eased. */
export function useIntro(seconds = 1): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return interpolate(frame, [0, seconds * fps], [0, 1], { extrapolateRight: "clamp", easing: (t) => 1 - Math.pow(1 - t, 3) });
}

export const Hills: React.FC<{ color: string; y: number; amplitude: number; phase?: number }> = ({ color, y, amplitude, phase = 0 }) => {
  const points: string[] = [];
  for (let x = 0; x <= WORLD.width; x += 40) {
    const yy = y + Math.sin(x / 260 + phase) * amplitude + Math.sin(x / 97 + phase * 2) * amplitude * 0.25;
    points.push(`${x},${yy.toFixed(1)}`);
  }
  return (
    <svg width={WORLD.width} height={WORLD.height} style={{ position: "absolute", inset: 0 }}>
      <polygon points={`0,${WORLD.height} ${points.join(" ")} ${WORLD.width},${WORLD.height}`} fill={color} />
    </svg>
  );
};

/** An original bean-head character. */
export const Bean: React.FC<{
  x: number;
  y: number;
  size?: number;
  color?: string;
  expression?: "happy" | "sad" | "surprised";
  /** Arm wave angle in degrees. */
  wave?: number;
  blink?: boolean;
  umbrella?: boolean;
}> = ({ x, y, size = 1, color = "#f2b84b", expression = "happy", wave = 0, blink = false, umbrella = false }) => {
  const eyeH = blink ? 2 : 22;
  const mouth =
    expression === "happy" ? "M -26 30 Q 0 54 26 30" : expression === "sad" ? "M -24 44 Q 0 24 24 44" : "M -10 36 a 10 12 0 1 0 20 0 a 10 12 0 1 0 -20 0";
  return (
    <svg
      width={400}
      height={520}
      viewBox="-200 -300 400 520"
      style={{ position: "absolute", left: x - 200 * size, top: y - 470 * size, width: 400 * size, height: 520 * size, overflow: "visible" }}
    >
      <ellipse cx={0} cy={205} rx={95} ry={14} fill="rgba(0,0,0,0.25)" />
      {umbrella ? (
        <g>
          <line x1={70} y1={-40} x2={70} y2={-250} stroke="#333" strokeWidth={8} />
          <path d="M -90 -230 Q 70 -380 230 -230 Z" fill="#e2483d" stroke="#9d2a22" strokeWidth={6} />
        </g>
      ) : null}
      {/* legs */}
      <rect x={-45} y={120} width={26} height={80} rx={12} fill="#3b3b58" />
      <rect x={19} y={120} width={26} height={80} rx={12} fill="#3b3b58" />
      {/* body */}
      <rect x={-85} y={-150} width={170} height={290} rx={85} fill={color} stroke="#2b2118" strokeWidth={7} />
      {/* arms */}
      <g transform={`rotate(${-20} -80 0)`}>
        <rect x={-130} y={-10} width={60} height={26} rx={13} fill={color} stroke="#2b2118" strokeWidth={6} />
      </g>
      <g transform={`rotate(${umbrella ? -70 : -wave} 80 0)`}>
        <rect x={70} y={-10} width={70} height={26} rx={13} fill={color} stroke="#2b2118" strokeWidth={6} />
      </g>
      {/* face */}
      <ellipse cx={-30} cy={-60} rx={13} ry={eyeH / 2 + 1} fill="#2b2118" />
      <ellipse cx={30} cy={-60} rx={13} ry={eyeH / 2 + 1} fill="#2b2118" />
      <circle cx={-55} cy={-25} r={14} fill="#ff8a7a" opacity={0.55} />
      <circle cx={55} cy={-25} r={14} fill="#ff8a7a" opacity={0.55} />
      <path d={mouth} transform="translate(0 -40)" fill={expression === "surprised" ? "#2b2118" : "none"} stroke="#2b2118" strokeWidth={7} strokeLinecap="round" />
    </svg>
  );
};

/** Blink a couple of times per second-ish, deterministically. */
export function useBlink(offset = 0): boolean {
  const frame = useCurrentFrame() + offset;
  const cycle = frame % 95;
  return cycle < 4;
}
