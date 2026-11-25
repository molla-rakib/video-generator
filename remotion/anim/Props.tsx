/**
 * Prop library. Each prop is drawn with its origin at bottom-center (y = 0 is
 * where it rests) in world units, and animates itself (propellers, flames,
 * flags, glows) from scene time `t`.
 */
import React from "react";
import { random } from "remotion";
import type { PropName } from "../../lib/spec/animation";
import { CARTOON_FONT } from "../theme";
import { shade, useOutline } from "./art";

type P = { t: number; color?: string; label?: string; thrust: number; moving: boolean };

const Flame: React.FC<{ t: number; x: number; y: number; w: number; h: number; on: number }> = ({ t, x, y, w, h, on }) => {
  if (on <= 0) return null;
  const f = 0.8 + Math.sin(t * 40) * 0.12 + random(`f${Math.floor(t * 30)}`) * 0.15;
  return (
    <g transform={`translate(${x} ${y}) scale(${on} ${on * f})`}>
      <path d={`M ${-w / 2} 0 Q 0 ${h * 1.4} ${w / 2} 0 Z`} fill="#ff7a1a" />
      <path d={`M ${-w / 3} 0 Q 0 ${h * 0.95} ${w / 3} 0 Z`} fill="#ffd23f" />
      <path d={`M ${-w / 6} 0 Q 0 ${h * 0.5} ${w / 6} 0 Z`} fill="#fff6d6" />
    </g>
  );
};

const Rocket: React.FC<P> = ({ t, color = "#e84a5f", thrust }) => {
  const ol = useOutline();
  return (
    <g>
      <Flame t={t} x={0} y={-30} w={70} h={150} on={thrust} />
      <path d="M -70 -40 L -40 -150 L -40 -40 Z" fill={color} {...ol} />
      <path d="M 70 -40 L 40 -150 L 40 -40 Z" fill={color} {...ol} />
      <rect x={-30} y={-48} width={60} height={22} rx={4} fill="#6b7280" {...ol} />
      <path d="M -48 -40 L -48 -330 Q -48 -470 0 -540 Q 48 -470 48 -330 L 48 -40 Z" fill="#f5f6fa" {...ol} />
      <path d="M -45 -400 Q -40 -480 0 -540 Q 40 -480 45 -400 Z" fill={color} {...ol} />
      <rect x={-48} y={-200} width={96} height={20} fill={color} />
      <circle cx={0} cy={-310} r={26} fill="#5dade2" stroke="#d5d8dc" strokeWidth={8} />
      <circle cx={-8} cy={-318} r={7} fill="#fff" opacity={0.7} />
      <path d="M 0 -40 L 0 -170" stroke="#e5e7eb" strokeWidth={4} />
    </g>
  );
};

const Biplane: React.FC<P> = ({ t, color = "#f2c14e" }) => {
  const ol = useOutline();
  const prop = Math.abs(Math.sin(t * 50));
  return (
    <g transform="translate(0 -90)">
      <rect x={-190} y={-90} width={360} height={16} rx={8} fill={color} {...ol} />
      <rect x={-190} y={-12} width={360} height={16} rx={8} fill={shade(color, -0.12)} {...ol} />
      {[-150, -60, 60, 140].map((x) => (
        <line key={x} x1={x} y1={-74} x2={x} y2={-12} stroke="#6b4f3a" strokeWidth={6} />
      ))}
      <path d="M -170 -40 L 150 -46 Q 196 -40 196 -26 Q 196 -16 150 -14 L -170 -20 Z" fill="#c8a165" {...ol} />
      <path d="M -170 -40 L -230 -70 L -228 -18 L -170 -20 Z" fill={color} {...ol} />
      <ellipse cx={-30} cy={-36} rx={26} ry={10} fill="#7a5c3e" />
      <g transform="translate(204 -30)">
        <ellipse cx={0} cy={0} rx={6} ry={48 * (0.3 + prop * 0.7)} fill="#5b4636" opacity={0.85} />
        <circle r={9} fill="#3d3d3d" />
      </g>
      <line x1={-20} y1={4} x2={-40} y2={60} stroke="#6b4f3a" strokeWidth={6} />
      <line x1={60} y1={4} x2={80} y2={60} stroke="#6b4f3a" strokeWidth={6} />
      <line x1={-80} y1={62} x2={140} y2={62} stroke="#8b6b4a" strokeWidth={8} strokeLinecap="round" />
    </g>
  );
};

const Airplane: React.FC<P> = ({ color = "#3d7dd8" }) => {
  const ol = useOutline();
  return (
    <g transform="translate(0 -60)">
      <path d="M -40 -30 L 40 -30 L -10 -130 L -40 -130 Z" fill={shade(color, -0.15)} {...ol} />
      <path d="M -240 -30 Q -260 -60 -220 -70 L 180 -70 Q 250 -60 250 -40 Q 250 -20 180 -10 L -220 -10 Z" fill="#f4f6fb" {...ol} />
      <path d="M -230 -70 L -260 -140 L -205 -140 L -170 -70 Z" fill={color} {...ol} />
      <path d="M -20 -20 L 60 -20 L -20 60 L -60 60 Z" fill={color} {...ol} />
      {[-150, -110, -70, -30, 10, 50, 90, 130].map((x) => (
        <circle key={x} cx={x} cy={-46} r={8} fill="#5dade2" />
      ))}
      <path d="M 200 -60 Q 236 -58 240 -44 L 200 -44 Z" fill="#2c3e50" />
    </g>
  );
};

const Car: React.FC<P> = ({ t, color = "#e74c3c", moving }) => {
  const ol = useOutline();
  const spin = moving ? t * 720 : 0;
  const wheel = (x: number) => (
    <g transform={`translate(${x} -36) rotate(${spin})`}>
      <circle r={36} fill="#2d3436" {...ol} />
      <circle r={16} fill="#b2bec3" />
      <line x1={-16} y1={0} x2={16} y2={0} stroke="#636e72" strokeWidth={4} />
    </g>
  );
  return (
    <g>
      <path d="M -190 -50 L -190 -110 Q -190 -130 -170 -132 L -110 -136 L -60 -200 L 70 -200 L 130 -136 L 180 -128 Q 200 -124 200 -100 L 200 -50 Z" fill={color} {...ol} />
      <path d="M -45 -186 L 2 -186 L 2 -140 L -82 -140 Z" fill="#aee2f6" />
      <path d="M 16 -186 L 62 -186 L 108 -140 L 16 -140 Z" fill="#aee2f6" />
      <rect x={176} y={-116} width={22} height={14} rx={4} fill="#fff3b0" />
      {wheel(-110)}
      {wheel(120)}
    </g>
  );
};

const Boat: React.FC<P> = ({ t, color = "#e17055" }) => {
  const ol = useOutline();
  const bob = Math.sin(t * 2) * 6;
  return (
    <g transform={`translate(0 ${bob}) rotate(${Math.sin(t * 1.6) * 2})`}>
      <path d="M -170 -60 L 170 -60 L 120 0 L -130 0 Z" fill={color} {...ol} />
      <rect x={-6} y={-330} width={12} height={272} fill="#7f5539" />
      <path d="M 10 -320 L 10 -80 L 150 -80 Z" fill="#fdfdfd" {...ol} />
      <path d="M -10 -280 L -10 -90 L -120 -90 Z" fill="#f1f2f6" {...ol} />
    </g>
  );
};

const Tree: React.FC<P> = ({ t, color = "#4caf50" }) => {
  const ol = useOutline();
  const sway = Math.sin(t * 1.3) * 2;
  return (
    <g>
      <path d="M -22 0 L -16 -170 L 16 -170 L 22 0 Z" fill="#8d5a3b" {...ol} />
      <g transform={`rotate(${sway} 0 -170)`}>
        <circle cx={-60} cy={-220} r={70} fill={shade(color, -0.1)} {...ol} />
        <circle cx={60} cy={-225} r={72} fill={shade(color, -0.05)} {...ol} />
        <circle cx={0} cy={-300} r={88} fill={color} {...ol} />
        <circle cx={-30} cy={-320} r={22} fill={shade(color, 0.25)} opacity={0.6} />
      </g>
    </g>
  );
};

const Pine: React.FC<P> = ({ color = "#2e7d4f" }) => {
  const ol = useOutline();
  return (
    <g>
      <rect x={-16} y={-60} width={32} height={60} fill="#7b4b2a" {...ol} />
      <polygon points="-120,-60 120,-60 0,-220" fill={shade(color, -0.1)} {...ol} />
      <polygon points="-100,-150 100,-150 0,-300" fill={color} {...ol} />
      <polygon points="-76,-230 76,-230 0,-370" fill={shade(color, 0.1)} {...ol} />
    </g>
  );
};

const House: React.FC<P> = ({ color = "#f6d6ad" }) => {
  const ol = useOutline();
  return (
    <g>
      <rect x={-160} y={-230} width={320} height={230} fill={color} {...ol} />
      <polygon points="-190,-226 190,-226 0,-380" fill="#c0392b" {...ol} />
      <rect x={-40} y={-120} width={80} height={120} rx={6} fill="#8e5b3a" {...ol} />
      <circle cx={24} cy={-60} r={6} fill="#f5c542" />
      {[-120, 70].map((x) => (
        <g key={x}>
          <rect x={x} y={-190} width={60} height={56} fill="#9ad3f5" {...ol} />
          <path d={`M ${x + 30} -190 L ${x + 30} -134 M ${x} -162 L ${x + 60} -162`} stroke="#fff" strokeWidth={5} />
        </g>
      ))}
    </g>
  );
};

const Skyscraper: React.FC<P> = ({ color = "#5b6c8f" }) => {
  const ol = useOutline();
  const rows = 12;
  return (
    <g>
      <rect x={-110} y={-700} width={220} height={700} fill={color} {...ol} />
      <rect x={-50} y={-760} width={100} height={60} fill={shade(color, -0.15)} {...ol} />
      <line x1={0} y1={-760} x2={0} y2={-830} stroke="#9aa5b8" strokeWidth={6} />
      {Array.from({ length: rows }, (_, r) =>
        [-80, -30, 20, 70].map((x) => <rect key={`${r}-${x}`} x={x} y={-670 + r * 54} width={30} height={34} rx={3} fill="#cfe8ff" opacity={0.85} />),
      )}
    </g>
  );
};

const Flag: React.FC<P> = ({ t, color = "#e74c3c", label }) => {
  const ol = useOutline();
  const pts: string[] = [];
  const w = 190;
  const h = 120;
  for (let i = 0; i <= 10; i++) {
    const x = (i / 10) * w;
    pts.push(`${x},${-440 + Math.sin(t * 5 - i * 0.6) * (i / 10) * 14}`);
  }
  for (let i = 10; i >= 0; i--) {
    const x = (i / 10) * w;
    pts.push(`${x},${-440 + h + Math.sin(t * 5 - i * 0.6) * (i / 10) * 14}`);
  }
  return (
    <g>
      <rect x={-7} y={-460} width={14} height={460} rx={6} fill="#a0a8b4" {...ol} />
      <circle cx={0} cy={-466} r={12} fill="#f5c542" {...ol} />
      <polygon points={pts.join(" ")} fill={color} transform="translate(7 0)" {...ol} />
      {label ? (
        <text x={w / 2 + 7} y={-370} textAnchor="middle" fontFamily={CARTOON_FONT} fontWeight={700} fontSize={34} fill="#fff">
          {label}
        </text>
      ) : null}
    </g>
  );
};

const Globe: React.FC<P> = ({ t, color = "#3c8dde" }) => {
  const ol = useOutline();
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const R = 130;
  const shift = ((t * 40) % 520) - 260;
  return (
    <g transform={`translate(0 ${-R - 10})`}>
      <defs>
        <clipPath id={`globe-clip-${uid}`}>
          <circle r={R} />
        </clipPath>
      </defs>
      <circle r={R} fill={color} {...ol} />
      <g clipPath={`url(#globe-clip-${uid})`} fill="#5cc96b">
        {[0, 520].map((o) => (
          <g key={o} transform={`translate(${shift - o} 0)`}>
            <path d="M -100 -70 Q -40 -110 0 -60 Q 30 -20 -20 10 Q -80 40 -110 -10 Z" />
            <path d="M 60 -40 Q 130 -60 160 0 Q 150 60 90 80 Q 50 40 60 -40 Z" />
            <path d="M -60 50 Q -20 40 0 90 Q -30 120 -70 100 Z" />
            <path d="M 220 -90 Q 300 -100 320 -40 Q 280 10 230 -20 Z" />
            <path d="M 300 40 Q 360 30 380 80 Q 330 110 300 80 Z" />
          </g>
        ))}
      </g>
      <circle r={R} fill={`url(#globe-shine-${uid})`} />
      <defs>
        <radialGradient id={`globe-shine-${uid}`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.35} />
          <stop offset="60%" stopColor="#fff" stopOpacity={0} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.25} />
        </radialGradient>
      </defs>
    </g>
  );
};

const Lightbulb: React.FC<P> = ({ t, color = "#ffe066" }) => {
  const ol = useOutline();
  const glow = 0.5 + Math.sin(t * 4) * 0.2;
  return (
    <g transform="translate(0 -40)">
      <g opacity={glow} stroke={color} strokeWidth={10} strokeLinecap="round">
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return <line key={i} x1={Math.cos(a) * 130} y1={-150 + Math.sin(a) * 130} x2={Math.cos(a) * 165} y2={-150 + Math.sin(a) * 165} />;
        })}
      </g>
      <circle cx={0} cy={-150} r={150} fill={color} opacity={glow * 0.25} />
      <path d="M -70 -150 A 90 90 0 1 1 70 -150 Q 50 -100 44 -60 L -44 -60 Q -50 -100 -70 -150 Z" fill={color} {...ol} />
      <rect x={-42} y={-60} width={84} height={50} rx={10} fill="#a0a8b4" {...ol} />
      <path d="M -20 -70 L -20 -130 L 0 -110 L 20 -130 L 20 -70" stroke="#e0a800" strokeWidth={5} fill="none" />
    </g>
  );
};

const Book: React.FC<P> = ({ color = "#c0392b", label }) => {
  const ol = useOutline();
  return (
    <g>
      <path d="M -170 -20 L 0 0 L 170 -20 L 170 -190 L 0 -170 L -170 -190 Z" fill={color} {...ol} />
      <path d="M -155 -30 L 0 -12 L 0 -170 L -155 -186 Z" fill="#fffaf0" {...ol} />
      <path d="M 155 -30 L 0 -12 L 0 -170 L 155 -186 Z" fill="#fdf6e3" {...ol} />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} stroke="#c8c2b4" strokeWidth={4}>
          <line x1={-130} y1={-150 + i * 24} x2={-30} y2={-140 + i * 24} />
          <line x1={30} y1={-140 + i * 24} x2={130} y2={-150 + i * 24} />
        </g>
      ))}
      {label ? (
        <text x={0} y={-205} textAnchor="middle" fontFamily={CARTOON_FONT} fontWeight={700} fontSize={36} fill="#fff" stroke="#000" strokeWidth={6} paintOrder="stroke">
          {label}
        </text>
      ) : null}
    </g>
  );
};

const Sign: React.FC<P> = ({ color = "#c98b52", label = "" }) => {
  const ol = useOutline();
  const w = Math.max(220, label.length * 26 + 60);
  return (
    <g>
      <rect x={-10} y={-260} width={20} height={260} fill="#8d5a3b" {...ol} />
      <rect x={-w / 2} y={-300} width={w} height={110} rx={12} fill={color} {...ol} />
      <text x={0} y={-230} textAnchor="middle" fontFamily={CARTOON_FONT} fontWeight={700} fontSize={44} fill="#3b2614">
        {label}
      </text>
    </g>
  );
};

const Telescope: React.FC<P> = ({ color = "#34495e" }) => {
  const ol = useOutline();
  return (
    <g>
      <g stroke="#6b4f3a" strokeWidth={10} strokeLinecap="round">
        <line x1={0} y1={-170} x2={-80} y2={0} />
        <line x1={0} y1={-170} x2={80} y2={0} />
        <line x1={0} y1={-170} x2={0} y2={0} />
      </g>
      <g transform="rotate(-32 0 -180)">
        <rect x={-120} y={-205} width={260} height={50} rx={14} fill={color} {...ol} />
        <rect x={130} y={-215} width={40} height={70} rx={8} fill={shade(color, -0.2)} {...ol} />
        <rect x={-150} y={-195} width={36} height={30} rx={6} fill="#bdc3c7" {...ol} />
      </g>
    </g>
  );
};

const Satellite: React.FC<P> = ({ t, color = "#f5c542" }) => {
  const ol = useOutline();
  return (
    <g transform={`translate(0 -120) rotate(${Math.sin(t * 0.8) * 8})`}>
      {[-1, 1].map((s) => (
        <g key={s}>
          <rect x={s === -1 ? -260 : 70} y={-40} width={190} height={80} fill="#2e5d9f" {...ol} />
          {[0, 1, 2, 3].map((i) => (
            <line key={i} x1={(s === -1 ? -260 : 70) + 38 + i * 38} y1={-40} x2={(s === -1 ? -260 : 70) + 38 + i * 38} y2={40} stroke="#7fb3f0" strokeWidth={3} />
          ))}
        </g>
      ))}
      <rect x={-70} y={-60} width={140} height={120} rx={10} fill={color} {...ol} />
      <line x1={0} y1={-60} x2={0} y2={-120} stroke="#bbb" strokeWidth={6} />
      <circle cx={0} cy={-128} r={14} fill="#ddd" {...ol} />
    </g>
  );
};

const Campfire: React.FC<P> = ({ t }) => {
  const ol = useOutline();
  return (
    <g>
      <circle cx={0} cy={-80} r={120} fill="#ffb347" opacity={0.12 + Math.sin(t * 9) * 0.03} />
      <Flame t={t} x={0} y={-30} w={110} h={-110} on={1} />
      <g {...ol}>
        <rect x={-90} y={-34} width={180} height={28} rx={14} fill="#7b4b2a" transform="rotate(14)" />
        <rect x={-90} y={-34} width={180} height={28} rx={14} fill="#8d5a3b" transform="rotate(-14)" />
      </g>
    </g>
  );
};

const Lander: React.FC<P> = ({ color = "#d4a72c", thrust, t }) => {
  const ol = useOutline();
  return (
    <g>
      <Flame t={t} x={0} y={-60} w={50} h={110} on={thrust} />
      <g stroke="#9aa0a6" strokeWidth={8}>
        <line x1={-90} y1={-120} x2={-150} y2={-6} />
        <line x1={90} y1={-120} x2={150} y2={-6} />
      </g>
      <ellipse cx={-150} cy={-4} rx={30} ry={8} fill="#9aa0a6" />
      <ellipse cx={150} cy={-4} rx={30} ry={8} fill="#9aa0a6" />
      <rect x={-110} y={-180} width={220} height={110} fill={color} {...ol} />
      <path d="M -90 -180 L -70 -280 L 80 -280 L 100 -180 Z" fill="#c9ced6" {...ol} />
      <polygon points="-30,-250 30,-250 20,-210 -20,-210" fill="#2c3e50" />
      <line x1={60} y1={-280} x2={60} y2={-340} stroke="#ccc" strokeWidth={5} />
    </g>
  );
};

const Planet: React.FC<P> = ({ color = "#e67e22" }) => {
  const ol = useOutline();
  return (
    <g transform="translate(0 -160)">
      <ellipse rx={230} ry={46} fill="none" stroke={shade(color, 0.3)} strokeWidth={16} transform="rotate(-16)" />
      <circle r={140} fill={color} {...ol} />
      <path d="M -130 -40 Q 0 -70 130 -40" stroke={shade(color, -0.15)} strokeWidth={18} fill="none" />
      <path d="M -138 30 Q 0 0 138 30" stroke={shade(color, 0.15)} strokeWidth={14} fill="none" />
      <path d="M -230 46 A 230 46 0 0 0 230 -46" transform="rotate(-16)" fill="none" stroke={shade(color, 0.3)} strokeWidth={16} />
    </g>
  );
};

const Laptop: React.FC<P> = ({ t, color = "#4a5568" }) => {
  const ol = useOutline();
  return (
    <g>
      <path d="M -150 0 L 150 0 L 130 -24 L -130 -24 Z" fill={shade(color, 0.2)} {...ol} />
      <rect x={-120} y={-200} width={240} height={176} rx={10} fill={color} {...ol} />
      <rect x={-106} y={-186} width={212} height={146} rx={4} fill="#1e2a3a" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={-90} y={-170 + i * 30} width={(80 + ((i * 53) % 90)) * (0.5 + 0.5 * Math.min(1, (t * 0.6 + i * 0.2) % 1.6))} height={12} rx={6} fill={["#5cc8ff", "#ffc93c", "#7bed9f", "#ff6b81"][i]} />
      ))}
    </g>
  );
};

const Crate: React.FC<P> = ({ color = "#c8915a" }) => {
  const ol = useOutline();
  return (
    <g>
      <rect x={-90} y={-180} width={180} height={180} rx={6} fill={color} {...ol} />
      <path d="M -90 -180 L 90 0 M 90 -180 L -90 0" stroke={shade(color, -0.25)} strokeWidth={12} />
      <rect x={-90} y={-180} width={180} height={180} rx={6} fill="none" stroke={shade(color, -0.3)} strokeWidth={12} />
    </g>
  );
};

const Bicycle: React.FC<P> = ({ t, color = "#2d98da", moving }) => {
  const spin = moving ? t * 600 : 0;
  const wheel = (x: number) => (
    <g transform={`translate(${x} -70) rotate(${spin})`}>
      <circle r={66} fill="none" stroke="#2d3436" strokeWidth={10} />
      {[0, 45, 90, 135].map((a) => (
        <line key={a} x1={-60} y1={0} x2={60} y2={0} stroke="#95a5a6" strokeWidth={3} transform={`rotate(${a})`} />
      ))}
    </g>
  );
  return (
    <g>
      {wheel(-110)}
      {wheel(110)}
      <path d="M -110 -70 L -30 -170 L 80 -170 L 110 -70 M -30 -170 L 10 -70 L -110 -70 M 10 -70 L 80 -170" stroke={color} strokeWidth={12} fill="none" strokeLinejoin="round" />
      <line x1={-40} y1={-170} x2={-50} y2={-200} stroke="#2d3436" strokeWidth={8} />
      <rect x={-80} y={-210} width={60} height={14} rx={7} fill="#2d3436" />
      <path d="M 80 -170 L 90 -215 L 120 -215" stroke="#2d3436" strokeWidth={8} fill="none" strokeLinecap="round" />
    </g>
  );
};

/** Space capsule; parachutes deploy while it is moving (descending). */
const Capsule: React.FC<P> = ({ t, color = "#c9ced6", moving }) => {
  const ol = useOutline();
  const bob = moving ? 0 : Math.sin(t * 2) * 6;
  const sway = Math.sin(t * 1.5) * 3;
  return (
    <g transform={`translate(0 ${bob})`}>
      {moving ? (
        <g transform={`rotate(${sway} 0 -170)`}>
          {[-1, 0, 1].map((i) => (
            <g key={i}>
              <line x1={i * 30} y1={-170} x2={i * 170} y2={-470} stroke="#9aa0a6" strokeWidth={3} />
              <line x1={i * 30} y1={-170} x2={i * 170 + (i === 0 ? -95 : i * 20 - 95)} y2={-470} stroke="#9aa0a6" strokeWidth={3} />
              <path d={`M ${i * 170 - 105} -470 Q ${i * 170} -620 ${i * 170 + 105} -470 Z`} fill={i === 0 ? "#ffffff" : "#e74c3c"} {...ol} />
              <path d={`M ${i * 170 - 35} -470 Q ${i * 170} -600 ${i * 170 + 35} -470 Z`} fill={i === 0 ? "#e74c3c" : "#ffffff"} />
            </g>
          ))}
        </g>
      ) : null}
      <path d="M -120 -20 L -64 -170 L 64 -170 L 120 -20 Z" fill={color} {...ol} />
      <rect x={-124} y={-24} width={248} height={24} rx={8} fill="#6b5a4a" {...ol} />
      <rect x={-30} y={-186} width={60} height={22} rx={6} fill={shade(color, -0.15)} {...ol} />
      <path d="M -12 -120 L 22 -120 L 26 -86 L -16 -86 Z" fill="#2c3e50" />
      {!moving ? <ellipse cx={0} cy={4} rx={170} ry={14} fill="#ffffff" opacity={0.45} /> : null}
    </g>
  );
};

const LIB: Record<PropName, React.FC<P>> = {
  capsule: Capsule,
  rocket: Rocket,
  biplane: Biplane,
  airplane: Airplane,
  car: Car,
  boat: Boat,
  tree: Tree,
  "pine-tree": Pine,
  house: House,
  skyscraper: Skyscraper,
  flag: Flag,
  globe: Globe,
  lightbulb: Lightbulb,
  book: Book,
  sign: Sign,
  telescope: Telescope,
  satellite: Satellite,
  campfire: Campfire,
  lander: Lander,
  planet: Planet,
  laptop: Laptop,
  crate: Crate,
  bicycle: Bicycle,
};

export const PropFigure: React.FC<{ name: PropName } & P> = ({ name, ...p }) => {
  const C = LIB[name];
  return <C {...p} />;
};
