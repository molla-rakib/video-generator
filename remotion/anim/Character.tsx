/**
 * Cartoon character puppet (3/4 view, facing right; mirrored for left).
 * Origin = between the feet on the ground. Adult height ≈ 400 units.
 */
import React from "react";
import type { CharacterLook, Expression } from "../../lib/spec/animation";
import { shade, useArt, useOutline } from "./art";
import type { Pose } from "./motion";

const SKIN: Record<CharacterLook["skin"], string> = {
  light: "#fbe0c9",
  fair: "#f2c9a0",
  tan: "#dba574",
  brown: "#a86e45",
  dark: "#6e4529",
};

// Skeleton (units, y up is negative)
const HIP_Y = -152;
const SHOULDER_Y = -256;
const HEAD_CY = -332;
const HEAD_R = 60;
const UPPER_ARM = 64;
const FOREARM = 58;
const THIGH = 78;
const SHIN = 70;
const FACE_X = 12; // features shifted toward the facing side

const rad = (d: number) => (d * Math.PI) / 180;

function limb(x0: number, y0: number, a1: number, l1: number, a2: number, l2: number) {
  const x1 = x0 + Math.sin(rad(a1)) * l1;
  const y1 = y0 + Math.cos(rad(a1)) * l1;
  const x2 = x1 + Math.sin(rad(a1 + a2)) * l2;
  const y2 = y1 + Math.cos(rad(a1 + a2)) * l2;
  return { x1, y1, x2, y2 };
}

/** A two-segment limb drawn as thick round-capped strokes (with optional outline). */
const Limb: React.FC<{
  x0: number;
  y0: number;
  a1: number;
  a2: number;
  l1: number;
  l2: number;
  w: number;
  upper: string;
  lower: string;
  end?: React.ReactNode;
  endColor: string;
  endR: number;
}> = ({ x0, y0, a1, a2, l1, l2, w, upper, lower, endColor, endR }) => {
  const art = useArt();
  const { x1, y1, x2, y2 } = limb(x0, y0, a1, l1, a2, l2);
  const ol = art.outline ? (
    <g stroke={art.outline} strokeWidth={w + art.ow * 2} strokeLinecap="round" fill="none">
      <line x1={x0} y1={y0} x2={x1} y2={y1} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
    </g>
  ) : null;
  return (
    <g>
      {ol}
      <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={upper} strokeWidth={w} strokeLinecap="round" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={lower} strokeWidth={w * 0.92} strokeLinecap="round" />
      <circle cx={x2} cy={y2} r={endR} fill={endColor} {...(art.outline ? { stroke: art.outline, strokeWidth: art.ow } : {})} />
    </g>
  );
};

/** A leg ending in a shoe pointing toward the facing direction. */
const Leg: React.FC<{ x0: number; y0: number; hip: number; knee: number; w: number; upper: string; lower: string; shoe: string }> = ({
  x0,
  y0,
  hip,
  knee,
  w,
  upper,
  lower,
  shoe,
}) => {
  const art = useArt();
  const { x1, y1, x2, y2 } = limb(x0, y0, hip, THIGH, knee, SHIN);
  const outline = art.outline ? { stroke: art.outline, strokeWidth: art.ow } : {};
  const footAngle = (hip + knee) * 0.6;
  return (
    <g>
      {art.outline ? (
        <g stroke={art.outline} strokeWidth={w + art.ow * 2} strokeLinecap="round">
          <line x1={x0} y1={y0} x2={x1} y2={y1} />
          <line x1={x1} y1={y1} x2={x2} y2={y2} />
        </g>
      ) : null}
      <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={upper} strokeWidth={w} strokeLinecap="round" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={lower} strokeWidth={w * 0.9} strokeLinecap="round" />
      <g transform={`translate(${x2} ${y2}) rotate(${-footAngle})`}>
        <path d={`M -14 -8 Q -14 -16 0 -16 L 18 -14 Q 34 -12 34 2 L 34 8 L -16 8 Z`} fill={shoe} {...outline} />
      </g>
    </g>
  );
};

// ─── Face ───────────────────────────────────────────────────────────────────

const Eyes: React.FC<{ expression: Expression; blink: boolean; eye: { x: number; y: number } }> = ({ expression, blink, eye }) => {
  const y = HEAD_CY - 4;
  const xs = [FACE_X - 18, FACE_X + 20];
  const ink = "#1d1a2b";
  if (!blink && (expression === "happy" || expression === "excited")) {
    return (
      <g stroke={ink} strokeWidth={4.5} strokeLinecap="round" fill="none">
        {xs.map((x, i) => (
          <path key={i} d={`M ${x - 7} ${y + 2} Q ${x} ${y - 8} ${x + 7} ${y + 2}`} />
        ))}
      </g>
    );
  }
  const big = expression === "surprised";
  const rx = big ? 8 : 6.5;
  const ry = blink ? 1.4 : big ? 11 : 9;
  return (
    <g>
      {xs.map((x, i) => (
        <g key={i}>
          <ellipse cx={x + eye.x * 2.5} cy={y + eye.y * 3} rx={rx} ry={ry} fill={ink} />
          {!blink ? <circle cx={x + eye.x * 2.5 + 2.2} cy={y + eye.y * 3 - 3} r={2.2} fill="#fff" /> : null}
        </g>
      ))}
    </g>
  );
};

const BROWS: Record<Expression, [number, number, number]> = {
  // [inner-end y offset, outer-end y offset, raise]
  neutral: [0, 0, 0],
  happy: [-1, 1, -2],
  excited: [-2, 0, -5],
  sad: [-6, 3, 0],
  surprised: [-2, -2, -7],
  angry: [6, -3, 0],
  worried: [-7, 2, -2],
  thinking: [-3, -6, -3],
};

const Brows: React.FC<{ expression: Expression; color: string }> = ({ expression, color }) => {
  const [inner, outer, raise] = BROWS[expression];
  const y = HEAD_CY - 21 + raise;
  const L = FACE_X - 18;
  const R = FACE_X + 20;
  return (
    <g stroke={color} strokeWidth={4.5} strokeLinecap="round">
      <line x1={L - 9} y1={y + outer} x2={L + 7} y2={y + inner} />
      <line x1={R - 7} y1={y + inner} x2={R + 9} y2={y + outer} />
    </g>
  );
};

const Mouth: React.FC<{ expression: Expression; open: number }> = ({ expression, open }) => {
  const x = FACE_X + 4;
  const y = HEAD_CY + 27;
  const ink = "#5b2128";
  if (open > 0.12) {
    const ry = 3 + open * 9;
    return (
      <g>
        <ellipse cx={x} cy={y} rx={11} ry={ry} fill={ink} />
        <ellipse cx={x} cy={y + ry * 0.45} rx={6} ry={ry * 0.4} fill="#e46a74" />
      </g>
    );
  }
  switch (expression) {
    case "happy":
      return <path d={`M ${x - 13} ${y - 3} Q ${x} ${y + 10} ${x + 13} ${y - 3}`} stroke={ink} strokeWidth={4.5} fill="none" strokeLinecap="round" />;
    case "excited":
      return <path d={`M ${x - 15} ${y - 5} Q ${x} ${y + 18} ${x + 15} ${y - 5} Z`} fill={ink} />;
    case "sad":
      return <path d={`M ${x - 11} ${y + 5} Q ${x} ${y - 5} ${x + 11} ${y + 5}`} stroke={ink} strokeWidth={4.5} fill="none" strokeLinecap="round" />;
    case "surprised":
      return <ellipse cx={x} cy={y + 2} rx={7} ry={9} fill={ink} />;
    case "angry":
      return <path d={`M ${x - 11} ${y + 3} L ${x + 11} ${y}`} stroke={ink} strokeWidth={4.5} strokeLinecap="round" />;
    case "worried":
      return (
        <path d={`M ${x - 12} ${y + 2} Q ${x - 6} ${y - 3} ${x} ${y + 2} Q ${x + 6} ${y + 6} ${x + 12} ${y + 1}`} stroke={ink} strokeWidth={4} fill="none" strokeLinecap="round" />
      );
    case "thinking":
      return <path d={`M ${x - 6} ${y + 2} L ${x + 10} ${y - 2}`} stroke={ink} strokeWidth={4.5} strokeLinecap="round" />;
    default:
      return <path d={`M ${x - 10} ${y} Q ${x} ${y + 5} ${x + 10} ${y}`} stroke={ink} strokeWidth={4.5} fill="none" strokeLinecap="round" />;
  }
};

// ─── Hair & hats ────────────────────────────────────────────────────────────

const r = HEAD_R;
const cy = HEAD_CY;

/** Hair drawn behind the head (long hair, ponytail, bun). */
const HairBack: React.FC<{ look: CharacterLook; sway: number }> = ({ look, sway }) => {
  const ol = useOutline();
  const c = look.hairColor;
  switch (look.hairStyle) {
    case "long":
      return <path d={`M ${-r - 6} ${cy - 10} Q ${-r - 14} ${cy + r * 1.5} ${-r * 0.3} ${cy + r * 1.35} L ${r * 0.5} ${cy + r * 1.2} Q ${r + 4} ${cy + 20} ${r} ${cy - 10} Z`} fill={shade(c, -0.08)} {...ol} />;
    case "ponytail":
      return (
        <path
          d={`M ${-r + 6} ${cy - 22} Q ${-r - 30} ${cy - 10 + sway} ${-r - 22} ${cy + 60 + sway} Q ${-r - 6} ${cy + 30} ${-r + 18} ${cy - 2} Z`}
          fill={shade(c, -0.08)}
          {...ol}
        />
      );
    case "bun":
      return <circle cx={-14} cy={cy - r - 10} r={24} fill={c} {...ol} />;
    default:
      return null;
  }
};

const HairFront: React.FC<{ look: CharacterLook }> = ({ look }) => {
  const ol = useOutline();
  const c = look.hairColor;
  const cap = `M ${-r - 3} ${cy + 6} Q ${-r - 6} ${cy - r - 10} ${4} ${cy - r - 10} Q ${r + 8} ${cy - r - 4} ${r + 3} ${cy - 10} Q ${r * 0.45} ${cy - r * 0.62} ${-r * 0.05} ${cy - r * 0.5} Q ${-r * 0.55} ${cy - r * 0.38} ${-r * 0.62} ${cy - 2} Q ${-r * 0.8} ${cy + 4} ${-r - 3} ${cy + 6} Z`;
  switch (look.hairStyle) {
    case "bald":
      return <path d={`M ${-r + 2} ${cy - 8} Q ${-r - 4} ${cy + 14} ${-r + 12} ${cy + 24}`} stroke={c} strokeWidth={9} fill="none" strokeLinecap="round" />;
    case "curly":
      return (
        <g fill={c} {...ol}>
          {Array.from({ length: 9 }, (_, i) => {
            const a = Math.PI * (1.02 + (i / 8) * 0.98);
            return <circle key={i} cx={Math.cos(a) * (r - 2)} cy={cy + Math.sin(a) * (r - 2) - 4} r={17} />;
          })}
        </g>
      );
    case "spiky": {
      const pts: string[] = [];
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI * (1.0 + i / 8);
        const rr = i % 2 === 0 ? r + 4 : r + 26;
        pts.push(`${Math.cos(a) * rr},${cy + Math.sin(a) * rr - 4}`);
      }
      return <polygon points={`${-r - 2},${cy + 4} ${pts.join(" ")} ${r + 2},${cy - 6} ${r * 0.2},${cy - r * 0.55}`} fill={c} {...ol} />;
    }
    case "side-part":
      return (
        <g>
          <path d={cap} fill={c} {...ol} />
          <path d={`M ${-r * 0.25} ${cy - r - 6} Q ${-r * 0.2} ${cy - r * 0.7} ${-r * 0.35} ${cy - r * 0.5}`} stroke={shade(c, 0.25)} strokeWidth={3} fill="none" />
        </g>
      );
    default:
      return <path d={cap} fill={c} {...ol} />;
  }
};

const Hat: React.FC<{ hat: CharacterLook["hat"]; color: string }> = ({ hat, color }) => {
  const ol = useOutline();
  switch (hat) {
    case "cap":
      return (
        <g {...ol}>
          <path d={`M ${-r - 4} ${cy - 14} Q ${-r} ${cy - r - 22} ${6} ${cy - r - 20} Q ${r + 8} ${cy - r - 16} ${r + 4} ${cy - 14} Z`} fill={color} />
          <path d={`M ${r - 10} ${cy - 18} Q ${r + 40} ${cy - 22} ${r + 46} ${cy - 10} L ${r - 4} ${cy - 8} Z`} fill={shade(color, -0.2)} />
        </g>
      );
    case "top-hat":
      return (
        <g {...ol}>
          <rect x={-r * 0.75} y={cy - r - 92} width={r * 1.5} height={88} rx={6} fill="#222" />
          <rect x={-r * 0.75} y={cy - r - 26} width={r * 1.5} height={12} fill={color} />
          <ellipse cx={0} cy={cy - r - 6} rx={r + 22} ry={11} fill="#1a1a1a" />
        </g>
      );
    case "flat-cap":
      return (
        <g {...ol}>
          <path d={`M ${-r - 6} ${cy - 16} Q ${-r + 6} ${cy - r - 18} ${12} ${cy - r - 14} Q ${r + 26} ${cy - r + 2} ${r + 30} ${cy - 18} Q ${r} ${cy - 8} ${-r - 6} ${cy - 16} Z`} fill={shade(color, -0.1)} />
        </g>
      );
    case "hard-hat":
      return (
        <g {...ol}>
          <path d={`M ${-r - 2} ${cy - 16} Q ${-r} ${cy - r - 26} ${2} ${cy - r - 24} Q ${r + 4} ${cy - r - 22} ${r + 2} ${cy - 16} Z`} fill="#f7c531" />
          <rect x={-r - 12} y={cy - 20} width={2 * r + 30} height={10} rx={5} fill="#e0ad17" />
        </g>
      );
    case "crown":
      return (
        <polygon
          points={`${-r * 0.7},${cy - r + 6} ${-r * 0.7},${cy - r - 36} ${-r * 0.35},${cy - r - 12} 0,${cy - r - 44} ${r * 0.35},${cy - r - 12} ${r * 0.7},${cy - r - 36} ${r * 0.7},${cy - r + 6}`}
          fill="#f5c542"
          {...ol}
        />
      );
    case "beret":
      return <ellipse cx={8} cy={cy - r + 2} rx={r + 10} ry={24} fill={color} transform={`rotate(-10 8 ${cy - r})`} {...ol} />;
    default:
      return null;
  }
};

// ─── Outfit pieces ──────────────────────────────────────────────────────────

function outfitColors(look: CharacterLook, skin: string) {
  switch (look.outfit) {
    case "astronaut":
      return { top: "#f1f3f6", bottom: "#e6e9ee", sleeve: "#f1f3f6", forearm: "#f1f3f6", hand: "#c3cad4", shoe: "#9aa4b1", thigh: "#e6e9ee", shin: "#e6e9ee" };
    case "scientist":
      return { top: "#fbfbfb", bottom: look.bottomColor, sleeve: "#fbfbfb", forearm: "#fbfbfb", hand: skin, shoe: "#3b2b22", thigh: look.bottomColor, shin: look.bottomColor };
    case "casual":
      return { top: look.topColor, bottom: look.bottomColor, sleeve: look.topColor, forearm: skin, hand: skin, shoe: "#3b2b22", thigh: look.bottomColor, shin: look.bottomColor };
    case "dress":
      return { top: look.topColor, bottom: look.bottomColor, sleeve: look.topColor, forearm: skin, hand: skin, shoe: "#5a2d3a", thigh: skin, shin: skin };
    case "robe":
      return { top: look.topColor, bottom: look.topColor, sleeve: look.topColor, forearm: look.topColor, hand: skin, shoe: "#4a3626", thigh: look.topColor, shin: look.topColor };
    default:
      return { top: look.topColor, bottom: look.bottomColor, sleeve: look.topColor, forearm: look.topColor, hand: skin, shoe: "#2f2420", thigh: look.bottomColor, shin: look.bottomColor };
  }
}

const Torso: React.FC<{ look: CharacterLook; bw: number; colors: ReturnType<typeof outfitColors> }> = ({ look, bw, colors }) => {
  const ol = useOutline();
  const tw = 52 * bw; // half width at shoulders
  const hw = 42 * bw; // half width at hips
  const top = SHOULDER_Y - 12;
  const bottom = HIP_Y + 8;
  const body = `M ${-tw} ${top + 22} Q ${-tw} ${top} ${-tw + 22} ${top} L ${tw - 22} ${top} Q ${tw} ${top} ${tw} ${top + 22} L ${hw} ${bottom - 10} Q ${hw} ${bottom} ${hw - 10} ${bottom} L ${-hw + 10} ${bottom} Q ${-hw} ${bottom} ${-hw} ${bottom - 10} Z`;
  const details: React.ReactNode[] = [];
  switch (look.outfit) {
    case "suit":
      details.push(
        <path key="shirt" d={`M -16 ${top} L 0 ${top + 52} L 16 ${top} Z`} fill="#ffffff" />,
        <path key="tie" d={`M -5 ${top + 6} L 5 ${top + 6} L 8 ${top + 48} L 0 ${top + 58} L -8 ${top + 48} Z`} fill="#c0392b" />,
        <path key="lapel" d={`M -18 ${top} L -2 ${top + 60} M 18 ${top} L 2 ${top + 60}`} stroke={shade(look.topColor, -0.3)} strokeWidth={3} />,
      );
      break;
    case "astronaut":
      details.push(
        <rect key="panel" x={-22} y={top + 26} width={44} height={30} rx={5} fill="#c9d1db" />,
        <circle key="b1" cx={-10} cy={top + 41} r={5} fill="#e74c3c" />,
        <circle key="b2" cx={4} cy={top + 41} r={5} fill="#3498db" />,
        <rect key="flag" x={tw - 30} y={top + 10} width={18} height={12} fill="#2e86de" />,
      );
      break;
    case "scientist":
      details.push(
        <path key="shirt" d={`M -14 ${top} L 0 ${top + 40} L 14 ${top} Z`} fill={look.topColor} />,
        <line key="open" x1={0} y1={top + 40} x2={0} y2={bottom} stroke="#d9dde2" strokeWidth={3} />,
        <rect key="pocket" x={14} y={top + 34} width={18} height={14} rx={3} fill="#eef0f2" />,
      );
      break;
    case "explorer":
      details.push(
        <rect key="p1" x={-34 * bw} y={top + 22} width={22} height={20} rx={4} fill={shade(look.topColor, -0.12)} />,
        <rect key="p2" x={12 * bw} y={top + 22} width={22} height={20} rx={4} fill={shade(look.topColor, -0.12)} />,
        <rect key="belt" x={-hw} y={bottom - 16} width={hw * 2} height={10} fill="#4a3424" />,
      );
      break;
    case "uniform":
      details.push(
        ...[0, 1, 2, 3].map((i) => <circle key={`b${i}`} cx={0} cy={top + 18 + i * 20} r={4.5} fill="#f5c542" />),
        <rect key="belt" x={-hw} y={bottom - 16} width={hw * 2} height={10} fill="#2b2b2b" />,
      );
      break;
    case "casual":
      details.push(<path key="collar" d={`M -16 ${top} Q 0 ${top + 18} 16 ${top}`} stroke={shade(look.topColor, -0.25)} strokeWidth={4} fill="none" />);
      break;
    case "robe":
      details.push(<path key="sash" d={`M ${-tw + 6} ${top + 10} L ${hw - 4} ${bottom - 20}`} stroke={shade(look.topColor, 0.35)} strokeWidth={10} />);
      break;
  }
  return (
    <g>
      <path d={body} fill={colors.top} {...ol} />
      {details}
    </g>
  );
};

/** Long garments drawn over the legs (dress skirt, lab coat, robe). */
const LowerGarment: React.FC<{ look: CharacterLook; bw: number; colors: ReturnType<typeof outfitColors> }> = ({ look, bw, colors }) => {
  const ol = useOutline();
  const hw = 42 * bw;
  if (look.outfit === "dress") {
    return <path d={`M ${-hw} ${HIP_Y - 4} L ${hw} ${HIP_Y - 4} L ${hw + 26} ${HIP_Y + 78} Q 0 ${HIP_Y + 90} ${-hw - 26} ${HIP_Y + 78} Z`} fill={look.bottomColor} {...ol} />;
  }
  if (look.outfit === "scientist") {
    return <path d={`M ${-hw - 2} ${HIP_Y - 4} L ${hw + 2} ${HIP_Y - 4} L ${hw + 12} ${HIP_Y + 74} L ${-hw - 12} ${HIP_Y + 74} Z`} fill={colors.top} {...ol} />;
  }
  if (look.outfit === "robe") {
    return <path d={`M ${-hw - 2} ${HIP_Y - 4} L ${hw + 2} ${HIP_Y - 4} L ${hw + 22} ${-14} Q 0 ${-6} ${-hw - 22} ${-14} Z`} fill={colors.top} {...ol} />;
  }
  return null;
};

// ─── Figure ─────────────────────────────────────────────────────────────────

export const CharacterFigure: React.FC<{
  look: CharacterLook;
  pose: Pose;
  expression: Expression;
  mouth: number;
  blink: boolean;
  eye: { x: number; y: number };
  t: number;
}> = ({ look, pose, expression, mouth, blink, eye, t }) => {
  const ol = useOutline();
  const skin = SKIN[look.skin];
  const bw = look.build === "slim" ? 0.88 : look.build === "broad" ? 1.16 : 1;
  const colors = outfitColors(look, skin);
  const shX = 44 * bw;
  const hipX = 20 * bw;
  const back = (c: string) => shade(c, -0.16);
  const legW = 30 * bw;
  const armW = 23 * bw;

  const upper = (
    <g transform={`rotate(${pose.lean} 0 ${HIP_Y})`}>
      {/* back arm */}
      <Limb
        x0={-shX + 8}
        y0={SHOULDER_Y + 6}
        a1={pose.bsh}
        a2={pose.bel}
        l1={UPPER_ARM}
        l2={FOREARM}
        w={armW}
        upper={back(colors.sleeve)}
        lower={back(colors.forearm)}
        endColor={back(colors.hand)}
        endR={13}
      />
      {look.outfit === "astronaut" ? <rect x={-shX - 22} y={SHOULDER_Y - 6} width={34} height={92} rx={10} fill="#d4dae2" {...ol} /> : null}
      <Torso look={look} bw={bw} colors={colors} />
      {/* neck + head */}
      <g transform={`rotate(${pose.head} 0 ${SHOULDER_Y - 8})`}>
        <HairBack look={look} sway={Math.sin(t * 3) * 6} />
        <rect x={-12} y={HEAD_CY + r - 14} width={24} height={30} fill={shade(skin, -0.08)} />
        <circle cx={0} cy={HEAD_CY} r={HEAD_R} fill={skin} {...ol} />
        <circle cx={-r + 8} cy={HEAD_CY + 8} r={12} fill={shade(skin, -0.05)} {...ol} />
        {expression === "happy" || expression === "excited" ? (
          <g fill="#ff7b8a" opacity={0.35}>
            <circle cx={FACE_X - 30} cy={HEAD_CY + 16} r={9} />
            <circle cx={FACE_X + 34} cy={HEAD_CY + 16} r={9} />
          </g>
        ) : null}
        <Eyes expression={expression} blink={blink} eye={eye} />
        <Brows expression={expression} color={shade(look.hairColor, -0.1)} />
        <path d={`M ${FACE_X + 30} ${HEAD_CY + 2} Q ${FACE_X + 40} ${HEAD_CY + 12} ${FACE_X + 29} ${HEAD_CY + 15}`} stroke={shade(skin, -0.25)} strokeWidth={3.5} fill="none" strokeLinecap="round" />
        {look.facialHair === "beard" ? (
          <path d={`M ${-r + 10} ${HEAD_CY + 6} Q ${-r + 14} ${HEAD_CY + r + 18} ${FACE_X + 4} ${HEAD_CY + r + 16} Q ${r} ${HEAD_CY + r} ${r - 4} ${HEAD_CY + 10} Q ${FACE_X + 6} ${HEAD_CY + 46} ${-r + 10} ${HEAD_CY + 6} Z`} fill={look.hairColor} {...ol} />
        ) : null}
        {look.facialHair !== "none" ? (
          <path d={`M ${FACE_X - 14} ${HEAD_CY + 22} Q ${FACE_X + 4} ${HEAD_CY + 12} ${FACE_X + 22} ${HEAD_CY + 22} Q ${FACE_X + 4} ${HEAD_CY + 26} ${FACE_X - 14} ${HEAD_CY + 22} Z`} fill={look.hairColor} />
        ) : null}
        <Mouth expression={expression} open={mouth} />
        {look.glasses ? (
          <g stroke="#232323" strokeWidth={3.5} fill="rgba(255,255,255,0.15)">
            <circle cx={FACE_X - 18} cy={HEAD_CY - 4} r={14} />
            <circle cx={FACE_X + 20} cy={HEAD_CY - 4} r={14} />
            <line x1={FACE_X - 4} y1={HEAD_CY - 6} x2={FACE_X + 6} y2={HEAD_CY - 6} />
          </g>
        ) : null}
        <HairFront look={look} />
        <Hat hat={look.hat} color={look.topColor} />
        {look.hat === "helmet" ? (
          <g>
            <circle cx={0} cy={HEAD_CY} r={r + 22} fill="rgba(190,225,255,0.22)" stroke="#e4e9f0" strokeWidth={9} />
            <path d={`M ${-r + 2} ${HEAD_CY - 30} Q ${-r + 20} ${HEAD_CY - r - 6} ${-4} ${HEAD_CY - r - 4}`} stroke="#fff" strokeOpacity={0.7} strokeWidth={7} fill="none" strokeLinecap="round" />
          </g>
        ) : null}
      </g>
      {/* front arm */}
      <Limb
        x0={shX - 8}
        y0={SHOULDER_Y + 6}
        a1={pose.fsh}
        a2={pose.fel}
        l1={UPPER_ARM}
        l2={FOREARM}
        w={armW}
        upper={colors.sleeve}
        lower={colors.forearm}
        endColor={colors.hand}
        endR={13}
      />
    </g>
  );

  return (
    <g>
      <ellipse cx={0} cy={4} rx={70 * bw} ry={12} fill="rgba(0,0,0,0.18)" />
      <g transform={`translate(0 ${pose.bob})`}>
        <Leg x0={-hipX} y0={HIP_Y} hip={pose.bhip} knee={pose.bknee} w={legW} upper={back(colors.thigh)} lower={back(colors.shin)} shoe={back(colors.shoe)} />
        <Leg x0={hipX} y0={HIP_Y} hip={pose.fhip} knee={pose.fknee} w={legW} upper={colors.thigh} lower={colors.shin} shoe={colors.shoe} />
        {/* waist */}
        <rect x={-38 * bw} y={HIP_Y - 18} width={76 * bw} height={34} rx={12} fill={colors.bottom} {...ol} />
        <LowerGarment look={look} bw={bw} colors={colors} />
        {upper}
      </g>
    </g>
  );
};
