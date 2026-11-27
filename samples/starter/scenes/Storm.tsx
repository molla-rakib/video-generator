import React from "react";
import { interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { Bean, Hills, Stage, useBlink, useVertical, WORLD } from "./kit";

/**
 * Rain arrives. A flash of lightning, then the character opens an umbrella.
 *
 * Editable props: rain (0–1, how heavy), flashAt (seconds into the shot).
 */
export default function Storm({ rain = 0.8, flashAt = 1.2 }: { rain?: number; flashAt?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = useVertical();
  const blink = useBlink(40);
  const flashFrame = Math.round(flashAt * fps);
  const flash = interpolate(frame, [flashFrame, flashFrame + 2, flashFrame + 10], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const umbrella = frame > flashFrame + fps * 0.6;
  const shake = flash > 0 ? Math.sin(frame * 3) * 8 * flash : 0;
  const drops = Math.round(60 + 160 * Math.max(0, Math.min(1, rain)));

  return (
    <Stage focusX={0.5} focusY={vertical ? 0.6 : 0.5} zoom={1.02} background="#2b3247">
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${shake}px)`, background: "linear-gradient(#2b3247, #586179)" }} />
      <Hills color="#3d5a3f" y={780} amplitude={40} />
      <Hills color="#2e4730" y={900} amplitude={22} phase={1.1} />
      <Bean x={960} y={880} size={1.1} color="#9fd6ff" expression={umbrella ? "happy" : "surprised"} blink={blink} umbrella={umbrella} />
      <svg width={WORLD.width} height={WORLD.height} style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: drops }, (_, i) => {
          const speed = 28 + random(`v${i}`) * 18;
          const x = random(`x${i}`) * (WORLD.width + 200) - 100;
          const y = ((random(`y${i}`) * WORLD.height + frame * speed) % (WORLD.height + 120)) - 60;
          return <line key={i} x1={x} y1={y} x2={x - 10} y2={y + 46} stroke="rgba(200,220,255,0.55)" strokeWidth={3} strokeLinecap="round" />;
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, background: "white", opacity: flash * 0.85 }} />
    </Stage>
  );
}
