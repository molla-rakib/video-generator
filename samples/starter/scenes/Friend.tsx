import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Bean, Hills, Stage, useBlink, useVertical } from "./kit";

/**
 * A friendly character hops onto the hill and waves.
 *
 * Editable props: expression ("happy" | "sad" | "surprised"), color.
 */
export default function Friend({ expression = "happy", color = "#f2b84b" }: { expression?: "happy" | "sad" | "surprised"; color?: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = useVertical();
  const hop = spring({ frame, fps, config: { damping: 11, stiffness: 120 } });
  const y = interpolate(hop, [0, 1], [1250, 820]);
  const wave = frame > fps * 0.8 ? 40 + 35 * Math.sin((frame - fps * 0.8) / 4) : 0;
  const blink = useBlink(12);
  const sun = interpolate(frame, [0, fps * 6], [0, 1], { extrapolateRight: "clamp" });

  return (
    <Stage focusX={0.5} focusY={vertical ? 0.62 : 0.5} zoom={vertical ? 1.05 : 1} background="#8fd3ff">
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(#7cc8ff, #d9f1ff)" }} />
      <div
        style={{
          position: "absolute",
          left: 260,
          top: 140 - sun * 30,
          width: 190,
          height: 190,
          borderRadius: "50%",
          background: "#ffd54a",
          boxShadow: "0 0 90px 40px rgba(255,213,74,0.5)",
        }}
      />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: ((i * 650 + frame * (1.2 + i * 0.4)) % 2300) - 300,
            top: 120 + i * 90,
            width: 260,
            height: 80,
            borderRadius: 60,
            background: "white",
            opacity: 0.9,
          }}
        />
      ))}
      <Hills color="#79c86b" y={760} amplitude={45} />
      <Hills color="#5aae4e" y={880} amplitude={30} phase={1.5} />
      <Bean x={960} y={y} size={1.15} color={color} expression={expression} wave={wave} blink={blink} />
    </Stage>
  );
}
