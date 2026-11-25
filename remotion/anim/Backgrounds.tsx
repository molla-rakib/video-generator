/**
 * Parametric, layered backgrounds. Each scene is built from parallax layers
 * (sky → far → mid → ground) so camera moves feel deep. Sizes derive from the
 * world, so every background fits every aspect ratio.
 */
import React from "react";
import { random } from "remotion";
import type { BackgroundName, TimeOfDay } from "../../lib/spec/animation";
import { mix, shade, useOutline } from "./art";
import type { World } from "./world";

export type LayerTransform = (factor: number) => string;

const SKY: Record<TimeOfDay, [string, string, string]> = {
  day: ["#4fb0f0", "#8fd0fa", "#d4f0ff"],
  sunset: ["#3e3a8c", "#e9795b", "#ffd08a"],
  night: ["#070b22", "#141b4a", "#2d3876"],
};

/** Darken / warm a scenery color for the time of day. */
function tod(color: string, time: TimeOfDay) {
  if (time === "night") return mix(color, "#141a3d", 0.55);
  if (time === "sunset") return mix(color, "#c4664f", 0.22);
  return color;
}

/** A smooth hill line across [x0, x1]. */
function hillPath(x0: number, x1: number, baseY: number, amp: number, seed: string, bottom: number, waves = 3, open = false) {
  const pts: string[] = [];
  const steps = 48;
  const p1 = random(`${seed}a`) * Math.PI * 2;
  const p2 = random(`${seed}b`) * Math.PI * 2;
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const u = (x - x0) / (x1 - x0);
    const y = baseY - amp * (0.55 * Math.sin(u * Math.PI * waves + p1) + 0.45 * Math.sin(u * Math.PI * waves * 2.3 + p2));
    pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return open ? pts.join(" ") : `${pts.join(" ")} L ${x1} ${bottom} L ${x0} ${bottom} Z`;
}

const Stars: React.FC<{ world: World; t: number; count?: number; maxY: number }> = ({ world, t, count = 90, maxY }) => {
  const M = world.W * 0.4;
  return (
    <g>
      {Array.from({ length: count }, (_, i) => {
        const x = -M + random(`sx${i}`) * (world.W + 2 * M);
        const y = random(`sy${i}`) * maxY;
        const tw = 0.5 + 0.5 * Math.sin(t * (1 + random(`st${i}`) * 3) + i);
        const r = 1.2 + random(`sr${i}`) * 2.4;
        return <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={0.35 + tw * 0.65} />;
      })}
    </g>
  );
};

const Cloud: React.FC<{ x: number; y: number; s: number; color: string }> = ({ x, y, s, color }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill={color}>
    <ellipse cx={0} cy={0} rx={90} ry={34} />
    <circle cx={-40} cy={-16} r={36} />
    <circle cx={10} cy={-34} r={46} />
    <circle cx={52} cy={-12} r={32} />
  </g>
);

const Clouds: React.FC<{ world: World; t: number; time: TimeOfDay }> = ({ world, t, time }) => {
  const M = world.W * 0.4;
  const span = world.W + 2 * M;
  const color = time === "sunset" ? "#ffd9c2" : time === "night" ? "#3a4377" : "#ffffff";
  return (
    <g opacity={time === "night" ? 0.6 : 0.92}>
      {[0, 1, 2, 3, 4].map((i) => {
        const base = random(`cx${i}`) * span;
        const x = -M + ((base + t * (8 + i * 3)) % span);
        const y = world.groundY * (0.12 + random(`cy${i}`) * 0.3);
        return <Cloud key={i} x={x} y={y} s={0.7 + random(`cs${i}`) * 0.7} color={color} />;
      })}
    </g>
  );
};

const SunMoon: React.FC<{ world: World; time: TimeOfDay }> = ({ world, time }) => {
  if (time === "night") {
    const x = world.W * 0.78;
    const y = world.groundY * 0.2;
    return (
      <g>
        <circle cx={x} cy={y} r={110} fill="#fff8d6" opacity={0.08} />
        <circle cx={x} cy={y} r={58} fill="#fff4c4" />
        <circle cx={x + 26} cy={y - 14} r={52} fill={SKY.night[0]} />
      </g>
    );
  }
  if (time === "sunset") {
    const x = world.W * 0.7;
    const y = world.groundY - 70;
    return (
      <g>
        <circle cx={x} cy={y} r={190} fill="#ffb36b" opacity={0.25} />
        <circle cx={x} cy={y} r={110} fill="#ff9248" />
      </g>
    );
  }
  const x = world.W * 0.8;
  const y = world.groundY * 0.2;
  return (
    <g>
      <circle cx={x} cy={y} r={140} fill="#fff7c2" opacity={0.25} />
      <circle cx={x} cy={y} r={70} fill="#ffe066" />
    </g>
  );
};

const SkyLayer: React.FC<{ world: World; time: TimeOfDay; t: number; colors?: [string, string, string]; sun?: boolean; clouds?: boolean; stars?: boolean }> = ({
  world,
  time,
  t,
  colors = SKY[time],
  sun = true,
  clouds = true,
  stars,
}) => {
  const M = world.W * 0.4;
  const id = `sky-${time}-${colors.join("")}`.replace(/#/g, "");
  return (
    <g>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colors[0]} />
          <stop offset="55%" stopColor={colors[1]} />
          <stop offset="100%" stopColor={colors[2]} />
        </linearGradient>
      </defs>
      <rect x={-M} y={-M} width={world.W + 2 * M} height={world.H + 2 * M} fill={`url(#${id})`} />
      {(stars ?? time === "night") ? <Stars world={world} t={t} maxY={world.groundY * 0.85} /> : null}
      {sun ? <SunMoon world={world} time={time} /> : null}
      {clouds && time !== "night" ? <Clouds world={world} t={t} time={time} /> : null}
    </g>
  );
};

// ─── Scene layer sets ───────────────────────────────────────────────────────

type Layers = { sky: React.ReactNode; far?: React.ReactNode; mid?: React.ReactNode; ground: React.ReactNode };

function useScene(scene: BackgroundName, time: TimeOfDay, world: World, t: number): Layers {
  const ol = useOutline(0.8);
  const { W, H, groundY: G } = world;
  const M = W * 0.4;
  const X0 = -M;
  const X1 = W + M;
  const B = H + M; // bottom
  const c = (hex: string) => tod(hex, time);
  const sky = <SkyLayer world={world} time={time} t={t} />;
  const groundRect = (fill: string, top = G) => <rect x={X0} y={top} width={X1 - X0} height={B - top} fill={fill} />;

  switch (scene) {
    case "meadow":
      return {
        sky,
        far: <path d={hillPath(X0, X1, G - 150, 50, "m-far", B, 2)} fill={c("#a8dba8")} />,
        mid: <path d={hillPath(X0, X1, G - 60, 40, "m-mid", B, 3)} fill={c("#79c27d")} {...ol} />,
        ground: (
          <g>
            {groundRect(c("#5fae4f"))}
            {Array.from({ length: 40 }, (_, i) => {
              const x = X0 + random(`gx${i}`) * (X1 - X0);
              const y = G + 20 + random(`gy${i}`) * (B - G - 40);
              const flower = i % 5 === 0;
              return flower ? (
                <circle key={i} cx={x} cy={y} r={7} fill={c(["#ff6b81", "#ffd23f", "#ffffff"][i % 3])} />
              ) : (
                <path key={i} d={`M ${x - 8} ${y} L ${x} ${y - 16} L ${x + 8} ${y}`} stroke={c("#4a9a3c")} strokeWidth={4} fill="none" />
              );
            })}
          </g>
        ),
      };
    case "forest": {
      const pine = (x: number, y: number, s: number, fill: string, k: string) => (
        <polygon key={k} points={`${x - 70 * s},${y} ${x + 70 * s},${y} ${x},${y - 260 * s}`} fill={fill} />
      );
      return {
        sky,
        far: <g>{Array.from({ length: 26 }, (_, i) => pine(X0 + i * ((X1 - X0) / 25), G - 90, 0.9 + random(`fp${i}`) * 0.5, c("#5d9b7a"), `f${i}`))}</g>,
        mid: <g>{Array.from({ length: 16 }, (_, i) => pine(X0 + i * ((X1 - X0) / 15) + 40, G - 10, 1.3 + random(`mp${i}`) * 0.5, c("#2f6e50"), `m${i}`))}</g>,
        ground: groundRect(c("#4f8f44")),
      };
    }
    case "mountains": {
      const peaks = (baseY: number, h: number, n: number, fill: string, snow: boolean, seed: string) => (
        <g>
          {Array.from({ length: n }, (_, i) => {
            const x = X0 + (i + 0.5) * ((X1 - X0) / n) + (random(`${seed}x${i}`) - 0.5) * 120;
            const ph = h * (0.7 + random(`${seed}h${i}`) * 0.5);
            const w = ph * 1.3;
            return (
              <g key={i}>
                <polygon points={`${x - w},${baseY} ${x},${baseY - ph} ${x + w},${baseY}`} fill={fill} {...ol} />
                {snow ? <polygon points={`${x - w * 0.22},${baseY - ph * 0.78} ${x},${baseY - ph} ${x + w * 0.22},${baseY - ph * 0.78} ${x + w * 0.08},${baseY - ph * 0.72} ${x - w * 0.06},${baseY - ph * 0.8}`} fill="#ffffff" /> : null}
              </g>
            );
          })}
        </g>
      );
      return {
        sky,
        far: peaks(G - 40, 420, 6, c("#8aa0c8"), true, "pk1"),
        mid: <path d={hillPath(X0, X1, G - 40, 36, "mt-mid", B, 3)} fill={c("#6fa564")} {...ol} />,
        ground: groundRect(c("#5c9a4c")),
      };
    }
    case "city": {
      const skyline = (baseY: number, n: number, minH: number, maxH: number, fill: string, seed: string, lit: boolean) => (
        <g>
          {Array.from({ length: n }, (_, i) => {
            const w = (X1 - X0) / n;
            const x = X0 + i * w;
            const h = minH + random(`${seed}${i}`) * (maxH - minH);
            return (
              <g key={i}>
                <rect x={x + 6} y={baseY - h} width={w - 12} height={h} fill={fill} {...ol} />
                {lit
                  ? Array.from({ length: Math.floor(h / 46) }, (_, r) =>
                      [0, 1, 2].map((col) =>
                        random(`${seed}w${i}${r}${col}`) > (time === "night" ? 0.45 : 0.15) ? (
                          <rect
                            key={`${r}-${col}`}
                            x={x + 20 + col * ((w - 40) / 3)}
                            y={baseY - h + 18 + r * 46}
                            width={(w - 60) / 3}
                            height={22}
                            fill={time === "night" ? "#ffd86b" : "#d6ecff"}
                            opacity={time === "night" ? 0.9 : 0.55}
                          />
                        ) : null,
                      ),
                    )
                  : null}
              </g>
            );
          })}
        </g>
      );
      return {
        sky,
        far: skyline(G - 70, 18, 180, 440, c("#9db2d3"), "c1", false),
        mid: skyline(G - 30, 11, 220, 520, c("#6c7fa6"), "c2", true),
        ground: (
          <g>
            {groundRect(c("#59606b"))}
            <rect x={X0} y={G - 30} width={X1 - X0} height={40} fill={c("#b9bfc9")} />
            {Array.from({ length: 30 }, (_, i) => (
              <rect key={i} x={X0 + i * 140} y={G + (B - G) * 0.35} width={70} height={10} rx={5} fill="#f1f2f6" opacity={0.8} />
            ))}
          </g>
        ),
      };
    }
    case "desert":
      return {
        sky: <SkyLayer world={world} time={time} t={t} colors={time === "day" ? ["#5fb6f0", "#a9dcf7", "#fbe7c0"] : SKY[time]} />,
        far: <path d={hillPath(X0, X1, G - 110, 45, "d-far", B, 2)} fill={c("#efc27e")} />,
        mid: (
          <g>
            <path d={hillPath(X0, X1, G - 40, 30, "d-mid", B, 2)} fill={c("#e7ad62")} {...ol} />
            {[0.15, 0.62, 1.05].map((u, i) => {
              const x = X0 + u * (X1 - X0);
              return (
                <g key={i} fill={c("#4f9d58")} {...ol}>
                  <rect x={x - 16} y={G - 190} width={32} height={170} rx={16} />
                  <rect x={x - 62} y={G - 140} width={24} height={70} rx={12} />
                  <rect x={x - 62} y={G - 92} width={60} height={22} rx={11} />
                  <rect x={x + 38} y={G - 160} width={24} height={60} rx={12} />
                  <rect x={x + 4} y={G - 122} width={58} height={22} rx={11} />
                </g>
              );
            })}
          </g>
        ),
        ground: groundRect(c("#f1cd8c")),
      };
    case "beach": {
      const seaTop = G - 150;
      return {
        sky,
        far: (
          <g>
            <rect x={X0} y={seaTop} width={X1 - X0} height={B - seaTop} fill={c("#2fa4d6")} />
            {Array.from({ length: 5 }, (_, r) => (
              <path
                key={r}
                d={hillPath(X0, X1, seaTop + 20 + r * 26 + Math.sin(t * 1.5 + r) * 4, 3, `w${r}`, 0, 14, true)}
                stroke="#bfeaff"
                strokeWidth={3}
                fill="none"
                opacity={0.6}
              />
            ))}
          </g>
        ),
        mid: (
          <g transform={`translate(${W * 0.88} ${G - 10})`}>
            <path d="M 0 0 Q 20 -150 -10 -300" stroke={c("#8d5a3b")} strokeWidth={22} fill="none" strokeLinecap="round" />
            {[-60, -20, 25, 70, 120].map((a, i) => (
              <ellipse key={i} cx={-10} cy={-300} rx={110} ry={24} fill={c("#3fa34d")} transform={`rotate(${a + Math.sin(t * 1.2 + i) * 3} -10 -300) translate(80 0)`} />
            ))}
          </g>
        ),
        ground: (
          <g>
            <path d={hillPath(X0, X1, G - 10, 8, "sand", B, 6)} fill={c("#f6dfa6")} />
            <path d={hillPath(X0, X1, G - 18 + Math.sin(t * 1.4) * 6, 4, "foam", G - 8, 10)} fill="#ffffff" opacity={0.7} />
          </g>
        ),
      };
    }
    case "dunes": {
      const seaTop = G - 190;
      return {
        sky,
        far: (
          <g>
            <rect x={X0} y={seaTop} width={X1 - X0} height={60} fill={c("#4aa3c7")} />
            <path d={hillPath(X0, X1, seaTop + 4 + Math.sin(t * 1.2) * 2, 2, "dn-w", 0, 18, true)} stroke="#d8f1ff" strokeWidth={3} fill="none" opacity={0.6} />
          </g>
        ),
        mid: (
          <g>
            <path d={hillPath(X0, X1, G - 110, 50, "dn-mid", B, 2)} fill={c("#e9cf98")} {...ol} />
            {Array.from({ length: 22 }, (_, i) => {
              const x = X0 + random(`bg${i}`) * (X1 - X0);
              const y = G - 70 + random(`bgy${i}`) * 40;
              return <path key={i} d={`M ${x - 14} ${y} Q ${x - 4} ${y - 30} ${x - 8} ${y - 46} M ${x} ${y} Q ${x + 2} ${y - 34} ${x + 6} ${y - 52} M ${x + 12} ${y} Q ${x + 10} ${y - 26} ${x + 20} ${y - 40}`} stroke={c("#9bb35a")} strokeWidth={4} fill="none" strokeLinecap="round" />;
            })}
          </g>
        ),
        ground: (
          <g>
            <path d={hillPath(X0, X1, G - 6, 10, "dn-g", B, 3)} fill={c("#f0d9a8")} />
            {Array.from({ length: 30 }, (_, i) => (
              <ellipse key={i} cx={X0 + random(`sp${i}`) * (X1 - X0)} cy={G + 30 + random(`spy${i}`) * (B - G - 60)} rx={18} ry={4} fill={c("#dcc189")} />
            ))}
          </g>
        ),
      };
    }
    case "ocean":
      return {
        sky,
        far: <rect x={X0} y={G - 220} width={X1 - X0} height={B} fill={c("#2490c7")} />,
        mid: <path d={hillPath(X0, X1, G - 90 + Math.sin(t * 1.3) * 6, 10, "oc-mid", B, 12)} fill={c("#1f7fb3")} />,
        ground: (
          <g>
            <path d={hillPath(X0 + ((t * 30) % 200) - 200, X1, G + 10 + Math.sin(t * 1.8) * 8, 12, "oc-near", B, 16)} fill={c("#196b99")} />
            <path d={hillPath(X0, X1, G + 10 + Math.sin(t * 1.8) * 8, 12, "oc-near", 0, 16, true)} stroke="#e8f7ff" strokeWidth={4} fill="none" opacity={0.6} />
          </g>
        ),
      };
    case "space":
      return {
        sky: (
          <g>
            <SkyLayer world={world} time="night" t={t} colors={["#05061a", "#120c3a", "#2a1155"]} sun={false} clouds={false} stars />
            <ellipse cx={W * 0.25} cy={H * 0.3} rx={W * 0.35} ry={H * 0.18} fill="#7a3fb8" opacity={0.18} />
            <ellipse cx={W * 0.75} cy={H * 0.65} rx={W * 0.3} ry={H * 0.15} fill="#2f6fd8" opacity={0.16} />
          </g>
        ),
        far: (
          <g>
            <circle cx={W * 0.82} cy={H * 0.22} r={70} fill="#e8906b" />
            <path d={`M ${W * 0.82 - 70} ${H * 0.22} Q ${W * 0.82} ${H * 0.22 - 30} ${W * 0.82 + 70} ${H * 0.22}`} stroke="#c96f4f" strokeWidth={14} fill="none" />
          </g>
        ),
        ground: null,
      };
    case "moon":
      return {
        sky: (
          <g>
            <SkyLayer world={world} time="night" t={t} colors={["#020308", "#05070f", "#0b0e1c"]} sun={false} clouds={false} stars />
            <g transform={`translate(${W * 0.22} ${G * 0.24})`}>
              <circle r={78} fill="#2f7fd8" />
              <path d="M -50 -30 Q -10 -60 20 -30 Q 10 0 -30 10 Z M 10 20 Q 50 10 60 40 Q 30 60 10 40 Z" fill="#5cc96b" />
              <circle r={78} fill="none" stroke="#9fd0ff" strokeWidth={6} opacity={0.4} />
            </g>
          </g>
        ),
        mid: <path d={hillPath(X0, X1, G - 50, 26, "moon-far", B, 2)} fill="#8d9099" />,
        ground: (
          <g>
            {groundRect("#b9bcc5")}
            {Array.from({ length: 14 }, (_, i) => {
              const x = X0 + random(`cr${i}`) * (X1 - X0);
              const y = G + 30 + random(`cry${i}`) * (B - G - 60);
              const r = 30 + random(`crr${i}`) * 60;
              return (
                <g key={i}>
                  <ellipse cx={x} cy={y} rx={r} ry={r * 0.32} fill="#9fa3ad" />
                  <ellipse cx={x} cy={y + 3} rx={r * 0.8} ry={r * 0.22} fill="#8e929c" />
                </g>
              );
            })}
          </g>
        ),
      };
    case "room": {
      const wall = c("#f1e3cc");
      const winX = W * 0.18;
      const winY = G * 0.28;
      const winW = Math.min(300, W * 0.24);
      const winH = winW * 0.9;
      return {
        sky: (
          <g>
            <rect x={X0} y={-M} width={X1 - X0} height={G + M} fill={wall} />
            {Array.from({ length: 40 }, (_, i) => (
              <rect key={i} x={X0 + i * 60} y={-M} width={26} height={G + M} fill={shade(wall, -0.04)} />
            ))}
          </g>
        ),
        far: (
          <g>
            <rect x={winX - 14} y={winY - 14} width={winW + 28} height={winH + 28} rx={8} fill={c("#8d5a3b")} {...ol} />
            <rect x={winX} y={winY} width={winW} height={winH} fill={SKY[time][1]} />
            {time === "night" ? <circle cx={winX + winW * 0.7} cy={winY + winH * 0.3} r={22} fill="#fff4c4" /> : <circle cx={winX + winW * 0.7} cy={winY + winH * 0.3} r={26} fill="#ffe066" />}
            <path d={`M ${winX + winW / 2} ${winY} L ${winX + winW / 2} ${winY + winH} M ${winX} ${winY + winH / 2} L ${winX + winW} ${winY + winH / 2}`} stroke={c("#8d5a3b")} strokeWidth={10} />
            <rect x={W * 0.62} y={G * 0.3} width={200} height={150} rx={6} fill={c("#c0392b")} {...ol} />
            <rect x={W * 0.62 + 16} y={G * 0.3 + 16} width={168} height={118} fill={c("#87c7a2")} />
            <path d={`M ${W * 0.62 + 16} ${G * 0.3 + 134} L ${W * 0.62 + 80} ${G * 0.3 + 70} L ${W * 0.62 + 130} ${G * 0.3 + 120} L ${W * 0.62 + 160} ${G * 0.3 + 90} L ${W * 0.62 + 184} ${G * 0.3 + 134} Z`} fill={c("#3e8e5e")} />
          </g>
        ),
        ground: (
          <g>
            {groundRect(c("#c38f5e"))}
            <rect x={X0} y={G - 22} width={X1 - X0} height={22} fill={c("#8d5a3b")} />
            {Array.from({ length: 6 }, (_, i) => (
              <line key={i} x1={X0} y1={G + 40 + i * 70} x2={X1} y2={G + 40 + i * 70} stroke={c("#a87547")} strokeWidth={4} />
            ))}
          </g>
        ),
      };
    }
    case "workshop": {
      const wall = c("#d8bf98");
      const benchY = G - 150;
      return {
        sky: (
          <g>
            <rect x={X0} y={-M} width={X1 - X0} height={G + M} fill={wall} />
            {Array.from({ length: 34 }, (_, i) => (
              <line key={i} x1={X0 + i * 80} y1={-M} x2={X0 + i * 80} y2={G} stroke={shade(wall, -0.12)} strokeWidth={4} />
            ))}
          </g>
        ),
        far: (
          <g>
            <rect x={W * 0.08} y={G * 0.22} width={W * 0.42} height={G * 0.36} rx={8} fill={c("#c9a477")} {...ol} />
            {Array.from({ length: 6 }, (_, i) => {
              const x = W * 0.12 + i * (W * 0.34) / 5;
              const y = G * 0.3;
              return i % 2 === 0 ? (
                <g key={i} fill={c("#5a5f66")}>
                  <rect x={x - 6} y={y} width={12} height={90} rx={4} />
                  <rect x={x - 26} y={y - 10} width={52} height={24} rx={6} />
                </g>
              ) : (
                <g key={i} fill={c("#5a5f66")}>
                  <rect x={x - 5} y={y + 20} width={10} height={80} rx={4} />
                  <circle cx={x} cy={y + 10} r={20} fill="none" stroke={c("#5a5f66")} strokeWidth={9} />
                </g>
              );
            })}
            {/* bicycle wheels hanging on the wall */}
            {[0, 1].map((i) => (
              <circle key={i} cx={W * 0.66 + i * 170} cy={G * 0.34} r={70} fill="none" stroke={c("#3a3f45")} strokeWidth={10} />
            ))}
          </g>
        ),
        mid: (
          <g>
            <rect x={X0} y={benchY} width={X1 - X0} height={26} fill={c("#8d5a3b")} {...ol} />
            <rect x={X0} y={benchY + 26} width={X1 - X0} height={G - benchY - 26} fill={c("#a06c44")} />
            {Array.from({ length: 12 }, (_, i) => (
              <rect key={i} x={X0 + i * 260 + 40} y={benchY + 50} width={180} height={70} rx={6} fill={c("#8d5a3b")} />
            ))}
          </g>
        ),
        ground: groundRect(c("#7d5c43")),
      };
    }
    case "studio":
    default:
      return {
        sky: (
          <g>
            <defs>
              <radialGradient id="studio-spot" cx="50%" cy="38%" r="70%">
                <stop offset="0%" stopColor="#5b4fc4" />
                <stop offset="100%" stopColor="#1e1a4a" />
              </radialGradient>
            </defs>
            <rect x={X0} y={-M} width={X1 - X0} height={B + M} fill="url(#studio-spot)" />
            {Array.from({ length: 18 }, (_, i) => (
              <circle key={i} cx={random(`bk${i}`) * W} cy={random(`bky${i}`) * G} r={30 + random(`bkr${i}`) * 80} fill="#ffffff" opacity={0.03 + random(`bko${i}`) * 0.04} />
            ))}
          </g>
        ),
        ground: (
          <g>
            <rect x={X0} y={G} width={X1 - X0} height={B - G} fill="#17143a" />
            <ellipse cx={W / 2} cy={G + 10} rx={W * 0.45} ry={40} fill="#ffffff" opacity={0.06} />
          </g>
        ),
      };
  }
}

/** Renders the scene's layers; `transform(f)` applies the camera with parallax factor f. */
export const Background: React.FC<{
  scene: BackgroundName;
  time: TimeOfDay;
  world: World;
  t: number;
  transform: LayerTransform;
  /** Rendered between the mid layer and the ground (e.g. far props). */
}> = ({ scene, time, world, t, transform }) => {
  const layers = useScene(scene, time, world, t);
  return (
    <g>
      <g transform={transform(0.12)}>{layers.sky}</g>
      {layers.far ? <g transform={transform(0.35)}>{layers.far}</g> : null}
      {layers.mid ? <g transform={transform(0.65)}>{layers.mid}</g> : null}
      <g transform={transform(1)}>{layers.ground}</g>
    </g>
  );
};
