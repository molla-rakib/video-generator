import React from "react";
import { interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { Hills, Stage, useIntro, WORLD } from "./kit";

/**
 * Opening shot: a quiet town at night. Windows light up one by one while
 * the camera slowly pushes in.
 *
 * Editable props: lightLevel (0–1.5), cameraZoom (1–1.6).
 */
export default function NightTown({ lightLevel = 1, cameraZoom = 1.25 }: { lightLevel?: number; cameraZoom?: number }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const intro = useIntro(1.2);
  const push = interpolate(frame, [0, durationInFrames], [1, cameraZoom], { extrapolateRight: "clamp" });
  const sky = Math.max(0, Math.min(1.5, lightLevel));

  const stars = Array.from({ length: 70 }, (_, i) => ({
    x: random(`sx${i}`) * WORLD.width,
    y: random(`sy${i}`) * 520,
    r: 1.5 + random(`sr${i}`) * 2.5,
    tw: 0.5 + 0.5 * Math.sin(frame / (6 + random(`st${i}`) * 10) + i),
  }));

  const houses = [
    { x: 520, w: 190, h: 200, roof: "#7a3b3b", wall: "#c98f5a" },
    { x: 760, w: 240, h: 250, roof: "#3b4f7a", wall: "#d9b27c" },
    { x: 1060, w: 200, h: 210, roof: "#5a3b7a", wall: "#c7a06b" },
    { x: 1310, w: 230, h: 240, roof: "#7a5a3b", wall: "#d2a774" },
  ];

  return (
    <Stage focusX={0.55} focusY={0.55} zoom={push} background="#0b1030">
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(#0b1030, rgb(${30 * sky + 20}, ${40 * sky + 25}, ${90 * sky + 40}))`,
        }}
      />
      {stars.map((s, i) => (
        <div key={i} style={{ position: "absolute", left: s.x, top: s.y, width: s.r * 2, height: s.r * 2, borderRadius: "50%", background: "white", opacity: 0.35 + 0.65 * s.tw }} />
      ))}
      {/* moon */}
      <div
        style={{
          position: "absolute",
          left: 1450,
          top: 120 + (1 - intro) * 60,
          width: 150,
          height: 150,
          borderRadius: "50%",
          background: "#fff6d5",
          boxShadow: `0 0 ${80 * sky}px ${30 * sky}px rgba(255,240,190,0.45)`,
        }}
      />
      <Hills color="#1c2452" y={700} amplitude={50} />
      {houses.map((h, i) => {
        const lit = frame > fps * (0.8 + i * 0.6);
        const top = 900 - h.h;
        return (
          <div key={i}>
            <div style={{ position: "absolute", left: h.x, top, width: h.w, height: h.h, background: h.wall, filter: `brightness(${0.45 + 0.25 * sky})` }} />
            <div
              style={{
                position: "absolute",
                left: h.x - 20,
                top: top - h.w * 0.45,
                width: 0,
                height: 0,
                borderLeft: `${h.w / 2 + 20}px solid transparent`,
                borderRight: `${h.w / 2 + 20}px solid transparent`,
                borderBottom: `${h.w * 0.45}px solid ${h.roof}`,
                filter: `brightness(${0.5 + 0.25 * sky})`,
              }}
            />
            {[0, 1].map((k) => (
              <div
                key={k}
                style={{
                  position: "absolute",
                  left: h.x + 30 + k * (h.w - 100),
                  top: top + 50,
                  width: 40,
                  height: 50,
                  borderRadius: 6,
                  background: lit ? "#ffd970" : "#2a2a3a",
                  boxShadow: lit ? "0 0 30px 8px rgba(255,210,110,0.55)" : "none",
                }}
              />
            ))}
          </div>
        );
      })}
      <Hills color="#10162f" y={930} amplitude={25} phase={2} />
    </Stage>
  );
}
