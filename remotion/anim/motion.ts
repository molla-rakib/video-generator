/**
 * Turns a timeline of actions into a pose for any moment in time.
 * Everything is a pure function of `t` (seconds), so rendering any frame in
 * any order (Remotion renders in parallel) always gives the same picture.
 */
import { random } from "remotion";
import type { CharacterActionName, CharacterElement, Expression, PropElement } from "../../lib/spec/animation";
import { OFFSTAGE_LEFT, OFFSTAGE_RIGHT } from "./world";

// ─── Pose ───────────────────────────────────────────────────────────────────

/**
 * Joint angles in degrees. 0 = limb hanging straight down; positive = swung
 * toward the direction the character faces. "f" = front (near) limbs, "b" = back.
 */
export type Pose = {
  fsh: number;
  fel: number;
  bsh: number;
  bel: number;
  fhip: number;
  fknee: number;
  bhip: number;
  bknee: number;
  /** Whole-body lean (deg). */
  lean: number;
  /** Head tilt (deg). */
  head: number;
  /** Vertical body offset (units, negative = up). */
  bob: number;
};

const ZERO: Pose = { fsh: 0, fel: 0, bsh: 0, bel: 0, fhip: 0, fknee: 0, bhip: 0, bknee: 0, lean: 0, head: 0, bob: 0 };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof Pose)[]) out[k] = lerp(a[k], b[k], t);
  return out;
}

const deg = (d: number) => d;

function idlePose(t: number): Pose {
  const breath = Math.sin(t * 2.1);
  return { ...ZERO, fsh: deg(4 + breath * 1.5), fel: 10, bsh: deg(-4 - breath * 1.5), bel: 8, bob: breath * 1.6 };
}

function walkPose(t: number, run: boolean): Pose {
  const freq = run ? 2.6 : 1.7;
  const p = t * Math.PI * 2 * freq * 0.5;
  const s = Math.sin(p);
  const c = Math.cos(p);
  const amp = run ? 38 : 24;
  return {
    fhip: amp * s,
    bhip: -amp * s,
    fknee: -Math.max(0, c) * (run ? 75 : 40),
    bknee: -Math.max(0, -c) * (run ? 75 : 40),
    fsh: -amp * 0.9 * s,
    bsh: amp * 0.9 * s,
    fel: run ? 85 : 22,
    bel: run ? 85 : 22,
    lean: run ? 9 : 3,
    head: 0,
    bob: -Math.abs(s) * (run ? 12 : 6),
  };
}

/** Gesture poses; `u` = seconds since the gesture started. */
function gesturePose(name: CharacterActionName, u: number, base: Pose): Pose {
  switch (name) {
    case "wave":
      return { ...base, fsh: 155, fel: 18 + Math.sin(u * 11) * 26, head: 4 };
    case "point":
      return { ...base, fsh: 82, fel: 4, lean: 3 };
    case "talk":
      return {
        ...base,
        fsh: 24 + Math.sin(u * 2.7) * 14,
        fel: 62 + Math.sin(u * 4.3) * 22,
        bsh: -8 + Math.sin(u * 2.1 + 1) * 6,
        head: Math.sin(u * 3.6) * 3,
      };
    case "cheer": {
      const hop = Math.abs(Math.sin(u * 6.2));
      return { ...base, fsh: 155 + Math.sin(u * 9) * 8, fel: 10, bsh: -155 - Math.sin(u * 9) * 8, bel: -10, bob: -hop * 26, head: -4 };
    }
    case "think":
      return { ...base, fsh: 12, fel: 152, head: 7 };
    case "jump": {
      const d = 0.9;
      const k = clamp01(u / d);
      const crouch = k < 0.18 ? Math.sin((k / 0.18) * Math.PI) * 14 : 0;
      const air = k >= 0.18 ? Math.sin(((k - 0.18) / 0.82) * Math.PI) * 110 : 0;
      return { ...base, fsh: 140 * Math.min(1, air / 60), bsh: -140 * Math.min(1, air / 60), fknee: -20 - crouch * 2, bknee: -20 - crouch * 2, bob: crouch - air };
    }
    case "nod":
      return { ...base, head: Math.sin(u * 9) * 9 };
    case "shrug":
      return { ...base, fsh: 32, fel: -78, bsh: -32, bel: 78, head: 6, bob: -3 };
    case "look-up":
      return { ...base, head: -14, lean: -3 };
    case "dance": {
      const s = Math.sin(u * 7);
      return { ...base, fsh: 110 + s * 40, fel: 40, bsh: -110 + s * 40, bel: -40, lean: s * 8, bob: -Math.abs(Math.cos(u * 7)) * 14, fhip: s * 14, bhip: -s * 14 };
    }
    default:
      return base;
  }
}

const GESTURE_DEFAULT_SEC: Partial<Record<CharacterActionName, number>> = {
  talk: 3,
  wave: 2,
  point: 2,
  cheer: 2,
  think: 2.5,
  jump: 0.9,
  nod: 1.2,
  shrug: 1.4,
  "look-up": 2,
  dance: 3,
  idle: 1,
};

const MOVES = new Set<CharacterActionName>(["walk-to", "run-to", "enter", "exit"]);
const WALK_SPEED = 0.26; // stage widths per second
const RUN_SPEED = 0.55;

// ─── Character state ────────────────────────────────────────────────────────

export type CharacterState = {
  visible: boolean;
  /** Stage x (may be off-stage). */
  x: number;
  facing: 1 | -1;
  pose: Pose;
  expression: Expression;
  /** 0 = closed, 1 = wide open. */
  mouth: number;
  blink: boolean;
  eye: { x: number; y: number };
};

type Segment = { t0: number; t1: number; x0: number; x1: number; run: boolean };

/** Precomputes movement segments; cached per element. */
function planMoves(el: CharacterElement) {
  const actions = [...el.actions].sort((a, b) => a.at - b.at);
  const first = actions[0];
  let x = el.x;
  if (first?.do === "enter") x = (first.from ?? "left") === "left" ? OFFSTAGE_LEFT : OFFSTAGE_RIGHT;
  const startX = x;
  const moves: Segment[] = [];
  let facing: 1 | -1 = el.facing === "left" ? -1 : 1;
  const facings: { at: number; f: 1 | -1 }[] = [{ at: -Infinity, f: facing }];

  for (const a of actions) {
    if (MOVES.has(a.do)) {
      const run = a.do === "run-to";
      let target = a.x ?? el.x;
      if (a.do === "exit") target = (a.to ?? (facing === 1 ? "right" : "left")) === "right" ? OFFSTAGE_RIGHT : OFFSTAGE_LEFT;
      if (a.do === "enter") {
        x = (a.from ?? "left") === "left" ? OFFSTAGE_LEFT : OFFSTAGE_RIGHT;
        target = a.x ?? el.x;
      }
      const dist = Math.abs(target - x);
      const dur = a.duration ?? Math.max(0.6, dist / (run ? RUN_SPEED : WALK_SPEED));
      if (dist > 0.001) {
        facing = target > x ? 1 : -1;
        facings.push({ at: a.at, f: facing });
      }
      moves.push({ t0: a.at, t1: a.at + dur, x0: x, x1: target, run });
      x = target;
    } else if (a.do === "turn") {
      facing = facing === 1 ? -1 : 1;
      facings.push({ at: a.at, f: facing });
    }
  }
  return { actions, startX, moves, facings };
}

const planCache = new WeakMap<CharacterElement, ReturnType<typeof planMoves>>();

export function characterStateAt(el: CharacterElement, t: number, speaking: boolean, seed: string): CharacterState {
  let plan = planCache.get(el);
  if (!plan) {
    plan = planMoves(el);
    planCache.set(el, plan);
  }
  const { actions, startX, moves, facings } = plan;

  // Position + locomotion
  let x = startX;
  let moving: Segment | null = null;
  for (const m of moves) {
    if (t >= m.t1) x = m.x1;
    else if (t >= m.t0) {
      const k = (t - m.t0) / (m.t1 - m.t0);
      x = lerp(m.x0, m.x1, k);
      moving = m;
      break;
    } else break;
  }
  const facing = facings.filter((f) => f.at <= t).at(-1)!.f;

  let pose = moving ? walkPose(t - moving.t0, moving.run) : idlePose(t);
  // Ease out of a walk into idle.
  if (!moving) {
    const lastMove = moves.filter((m) => m.t1 <= t).at(-1);
    if (lastMove && t - lastMove.t1 < 0.25) pose = lerpPose(walkPose(lastMove.t1 - lastMove.t0, lastMove.run), pose, smooth((t - lastMove.t1) / 0.25));
  }

  // Gestures (arms/head override, legs keep walking if moving)
  let expression: Expression = el.expression;
  let talking = speaking;
  let eye = { x: 0, y: 0 };
  for (const a of actions) {
    if (a.at > t) break;
    if (a.expression) expression = a.expression;
    if (MOVES.has(a.do) || a.do === "turn") continue;
    const dur = a.duration ?? GESTURE_DEFAULT_SEC[a.do] ?? 1.5;
    const u = t - a.at;
    if (u > dur) continue;
    const w = Math.min(smooth(u / 0.22), smooth((dur - u) / 0.22));
    let g = gesturePose(a.do, u, pose);
    if (moving) g = { ...g, fhip: pose.fhip, bhip: pose.bhip, fknee: pose.fknee, bknee: pose.bknee, bob: pose.bob };
    pose = lerpPose(pose, g, w);
    if (a.do === "talk") talking = true;
    if (a.do === "look-up") eye = { x: 0.3, y: -1 };
    if (a.do === "think") eye = { x: 0.6, y: -0.8 };
  }

  // Mouth
  let mouth = 0;
  if (talking) {
    const v = Math.sin(t * 15) * 0.55 + Math.sin(t * 6.7 + 1.3) * 0.45;
    mouth = clamp01(0.25 + v * 0.75);
  }

  // Blinks every ~2.5–4.5s, deterministic per character.
  const period = 2.5 + random(`blink-${seed}`) * 2;
  const phase = (t + random(`blink-off-${seed}`) * period) % period;
  const blink = phase < 0.12;

  const firstAt = actions[0]?.at ?? 0;
  const visible = !(el.hiddenUntilFirstAction && t < firstAt);

  return { visible, x, facing, pose, expression, mouth, blink, eye };
}

// ─── Props ──────────────────────────────────────────────────────────────────

export type PropState = {
  visible: boolean;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  rotate: number;
  /** Extra vertical offset in world units (launches, floating). */
  dy: number;
  /** Rocket flame / engine on. */
  thrust: number;
  moving: boolean;
};

export function propStateAt(el: PropElement, t: number, worldH: number): PropState {
  const actions = [...el.actions].sort((a, b) => a.at - b.at);
  let x = el.x;
  let y = el.y;
  let scale = 1;
  let opacity = 1;
  let rotate = 0;
  let dy = 0;
  let thrust = 0;
  let moving = false;
  let visible = !(el.hiddenUntilFirstAction && t < (actions[0]?.at ?? 0));

  // Hidden before a pop-in / fade-in that is the first thing it does.
  const firstReveal = actions.find((a) => a.do === "pop-in" || a.do === "fade-in");
  if (firstReveal && t < firstReveal.at && actions[0] === firstReveal) visible = false;

  for (const a of actions) {
    if (a.at > t) break;
    const u = t - a.at;
    switch (a.do) {
      case "pop-in": {
        const k = clamp01(u / 0.45);
        // overshoot spring
        scale *= k >= 1 ? 1 : 1 - Math.pow(1 - k, 3) * Math.cos(k * Math.PI * 2.2) * 1.0;
        scale = Math.max(0, scale);
        break;
      }
      case "fade-in":
        opacity *= clamp01(u / 0.6);
        break;
      case "move-to": {
        const dur = a.duration ?? 1.5;
        const k = smooth(u / dur);
        const tx = a.x ?? x;
        const ty = a.y ?? y;
        if (u < dur) {
          moving = true;
          // Engines fire while rockets / landers are being moved (e.g. a landing).
          if (el.prop === "rocket" || el.prop === "lander") thrust = Math.max(thrust, 0.7);
        }
        x = lerp(x, tx, k);
        y = lerp(y, ty, k);
        break;
      }
      case "fly-across": {
        const dur = a.duration ?? 4;
        const k = clamp01(u / dur);
        const right = (a.to ?? "right") === "right";
        x = right ? lerp(OFFSTAGE_LEFT - 0.1, OFFSTAGE_RIGHT + 0.1, k) : lerp(OFFSTAGE_RIGHT + 0.1, OFFSTAGE_LEFT - 0.1, k);
        if (a.y !== undefined) y = a.y;
        if (u < dur) moving = true;
        dy += Math.sin(u * 2.4) * 8;
        rotate += Math.sin(u * 1.7) * 3;
        break;
      }
      case "float":
        dy += Math.sin(u * 2.2) * 12;
        break;
      case "spin": {
        const dur = a.duration ?? 1.2;
        rotate += 360 * smooth(u / dur);
        break;
      }
      case "launch": {
        const dur = a.duration ?? 3.5;
        const shakeT = 0.9;
        thrust = clamp01(u / 0.3);
        if (u < shakeT) {
          rotate += Math.sin(u * 60) * 0.8;
        } else {
          const k = u - shakeT;
          const rise = worldH * 1.6;
          const acc = (2 * rise) / Math.pow(Math.max(0.5, dur - shakeT), 2);
          dy -= 0.5 * acc * k * k;
          rotate += Math.sin(u * 40) * 0.4;
        }
        moving = true;
        break;
      }
      case "shake": {
        const dur = a.duration ?? 0.7;
        if (u < dur) rotate += Math.sin(u * 50) * 4 * (1 - u / dur);
        break;
      }
      case "pulse": {
        const dur = a.duration ?? 0.7;
        if (u < dur) scale *= 1 + Math.sin((u / dur) * Math.PI) * 0.16;
        break;
      }
      case "exit": {
        const k = clamp01(u / 0.4);
        scale *= 1 - smooth(k);
        if (k >= 1) visible = false;
        break;
      }
    }
  }
  return { visible, x, y, scale, opacity, rotate, dy, thrust, moving };
}
