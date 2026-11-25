import React, { useMemo } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { AnimationVisual, CastMember, CharacterElement, PropElement } from "../../lib/spec/animation";
import type { ArtStyle, Ratio } from "../../lib/spec/schema";
import { FilmGrain } from "../components/Looks";
import type { Theme } from "../theme";
import { ARTS, ArtContext } from "./art";
import { Background } from "./Backgrounds";
import { CharacterFigure } from "./Character";
import { Effect, PaperTexture } from "./Effects";
import { CounterOverlay, SpeechBubble, TextOverlay, TimelineOverlay } from "./AnimOverlays";
import { characterStateAt, propStateAt, type CharacterState, type PropState } from "./motion";
import { PropFigure } from "./Props";
import { getWorld, stageToWorldX, stageToWorldY } from "./world";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (v: number) => {
  const x = clamp01(v);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/** Head-top height of a character in world units (relative to its feet). */
const HEAD_TOP = 400;

type Props = {
  visual: AnimationVisual;
  cast: CastMember[];
  ratio: Ratio;
  art: ArtStyle;
  theme: Theme;
  /** Seconds since the scene became fully visible (may be negative during the incoming transition). */
  t: number;
  /** Visible length of the scene in seconds (drives camera moves). */
  duration: number;
  /** Hide speech/text overlays (used for title-card backdrops). */
  backgroundOnly?: boolean;
};

export const AnimatedScene: React.FC<Props> = ({ visual, cast, ratio, art: artName, theme, t, duration, backgroundOnly }) => {
  const { width, height } = useVideoConfig();
  const world = useMemo(() => getWorld(ratio, width, height), [ratio, width, height]);
  const art = ARTS[artName];
  const castById = useMemo(() => new Map(cast.map((c) => [c.id, c])), [cast]);
  const elements = backgroundOnly ? [] : visual.elements;

  // Who is speaking right now (speech bubbles make characters talk).
  const speaking = new Set(
    elements.filter((e) => e.type === "speech" && t >= e.at && t <= e.at + e.duration).map((e) => (e as { characterId: string }).characterId),
  );

  const characters = elements.filter((e): e is CharacterElement => e.type === "character");
  const props = elements.filter((e): e is PropElement => e.type === "prop");
  const charStates = new Map<string, CharacterState>(characters.map((c) => [c.id, characterStateAt(c, t, speaking.has(c.id), c.id)]));
  const propStates = new Map<string, PropState>(props.map((p) => [p.id, propStateAt(p, t, world.H)]));

  // ─── Camera ────────────────────────────────────────────────────────────────
  const { W, H, groundY } = world;
  const anchorY = groundY - 200;
  const p = easeInOut(t / Math.max(1, duration));
  const targetId = visual.camera.target;
  const targetX = (() => {
    if (!targetId) return W / 2;
    const cs = charStates.get(targetId);
    if (cs) return stageToWorldX(world, cs.x);
    const ps = propStates.get(targetId);
    if (ps) return stageToWorldX(world, ps.x);
    return W / 2;
  })();
  let zoom = 1;
  let cx = W / 2;
  switch (visual.camera.move) {
    case "push-in":
      zoom = 1 + 0.2 * p;
      cx = W / 2 + (targetX - W / 2) * 0.7 * p;
      break;
    case "pull-out":
      zoom = 1.2 - 0.2 * p;
      cx = W / 2 + (targetX - W / 2) * 0.7 * (1 - p);
      break;
    case "pan-left":
      zoom = 1.06;
      cx = W / 2 + W * 0.07 - W * 0.14 * p;
      break;
    case "pan-right":
      zoom = 1.06;
      cx = W / 2 - W * 0.07 + W * 0.14 * p;
      break;
    case "follow":
      zoom = 1.08;
      cx = Math.min(W / 2 + W * 0.3, Math.max(W / 2 - W * 0.3, targetX));
      break;
  }
  const transform = (f: number) => {
    const z = 1 + (zoom - 1) * f;
    const c = W / 2 + (cx - W / 2) * f;
    return `translate(${W / 2} ${anchorY}) scale(${z}) translate(${-c} ${-anchorY})`;
  };
  /** World (camera layer f=1) → composition pixels. */
  const toScreen = (wx: number, wy: number) => ({
    x: ((wx - cx) * zoom + W / 2) * world.px,
    y: ((wy - anchorY) * zoom + anchorY) * world.px,
  });
  /** Stage → composition pixels without camera (for titles, counters, timelines). */
  const stageToScreen = (sx: number, sy: number) => ({ x: stageToWorldX(world, sx) * world.px, y: stageToWorldY(world, sy) * world.px });

  // ─── Draw order: sky props, ground props, then characters (smaller = farther) ─
  const sortedProps = [...props].sort((a, b) => a.y - b.y || a.scale - b.scale);
  const sortedChars = [...characters].sort((a, b) => a.scale - b.scale);
  const timeFilter = visual.background.time === "night" ? "brightness(0.82) saturate(0.92)" : visual.background.time === "sunset" ? "sepia(0.12) saturate(1.05)" : undefined;

  const propNodes = sortedProps.map((el) => {
    const s = propStates.get(el.id)!;
    if (!s.visible || s.scale <= 0.001) return null;
    const wx = stageToWorldX(world, s.x);
    const wy = stageToWorldY(world, s.y) + s.dy;
    const sc = el.scale * s.scale;
    return (
      <g key={el.id} transform={`translate(${wx} ${wy}) rotate(${s.rotate} 0 ${-120 * el.scale}) scale(${el.flip ? -sc : sc} ${sc})`} opacity={s.opacity}>
        <PropFigure name={el.prop} t={t} color={el.color} label={el.label} thrust={s.thrust} moving={s.moving} />
      </g>
    );
  });

  const charNodes = sortedChars.map((el) => {
    const s = charStates.get(el.id)!;
    const member = castById.get(el.castId);
    if (!s.visible || !member) return null;
    const wx = stageToWorldX(world, s.x);
    const sc = el.scale * member.look.height;
    return (
      <g key={el.id} transform={`translate(${wx} ${groundY}) scale(${sc * s.facing} ${sc})`}>
        <CharacterFigure look={member.look} pose={s.pose} expression={s.expression} mouth={s.mouth} blink={s.blink} eye={s.eye} t={t} />
      </g>
    );
  });

  const effects = elements.filter((e) => e.type === "effect");

  return (
    <ArtContext.Provider value={art}>
      <AbsoluteFill style={{ filter: art.filter, overflow: "hidden" }}>
        <svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
          <Background scene={visual.background.scene} time={visual.background.time} world={world} t={t} transform={transform} />
          <g transform={transform(1)} style={{ filter: timeFilter }}>
            {propNodes}
            {charNodes}
          </g>
          {effects.map((e, i) => {
            if (e.type !== "effect" || t < e.at) return null;
            const end = e.duration !== undefined ? e.at + e.duration : Infinity;
            if (t > end + 0.5) return null;
            const op = Math.min(clamp01((t - e.at) / 0.4), clamp01((end - t) / 0.5 + 1));
            return <Effect key={i} name={e.effect} t={t - e.at} world={world} intensity={e.intensity} opacity={op} />;
          })}
        </svg>
        {art.texture === "paper" ? <PaperTexture /> : null}
        {art.texture === "grain" ? <FilmGrain opacity={0.1} /> : null}

        {/* Overlays */}
        {elements.map((e, i) => {
          if (e.type === "speech") {
            const cs = charStates.get(e.characterId);
            const ch = characters.find((c) => c.id === e.characterId);
            const member = ch ? castById.get(ch.castId) : undefined;
            if (!cs || !ch || !member || !cs.visible) return null;
            const headTop = groundY - HEAD_TOP * ch.scale * member.look.height + cs.pose.bob;
            const anchor = toScreen(stageToWorldX(world, cs.x), headTop);
            return <SpeechBubble key={i} el={e} t={t} anchor={anchor} facing={cs.facing} frame={{ w: width, h: height }} px={world.px} />;
          }
          if (e.type === "text") return <TextOverlay key={i} el={e} t={t} pos={stageToScreen(e.x, e.y)} px={world.px} theme={theme} frameW={width} />;
          if (e.type === "counter") return <CounterOverlay key={i} el={e} t={t} pos={stageToScreen(e.x, e.y)} px={world.px} theme={theme} frameW={width} />;
          if (e.type === "timeline")
            return <TimelineOverlay key={i} el={e} t={t} y={stageToScreen(0.5, e.y).y} px={world.px} theme={theme} frameW={width} portrait={world.portrait} />;
          return null;
        })}
      </AbsoluteFill>
    </ArtContext.Provider>
  );
};
