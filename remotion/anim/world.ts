/**
 * Stage geometry for animated scenes.
 *
 * Scenes are drawn in "world units". The world is sized per aspect ratio so a
 * character (400 units tall) reads well in every format: wide stages for 16:9,
 * tall stages (more sky, room for captions) for 9:16 and 4:5.
 *
 * Claude positions things on a normalized *stage*:
 *   x: 0 = left edge … 1 = right edge (with a small margin)
 *   y: 1 = standing on the ground … 0 = top of the frame
 */
import type { Ratio } from "../../lib/spec/schema";

export type World = {
  /** World size in units. */
  W: number;
  H: number;
  /** y (in units) of the ground line. */
  groundY: number;
  /** Horizontal stage margin in units. */
  pad: number;
  /** Composition pixels per world unit. */
  px: number;
  portrait: boolean;
};

const WORLDS: Record<Ratio, { W: number; ground: number }> = {
  "16:9": { W: 1920, ground: 0.8 },
  "1:1": { W: 1200, ground: 0.78 },
  "4:5": { W: 1120, ground: 0.72 },
  "9:16": { W: 960, ground: 0.6 },
};

export function getWorld(ratio: Ratio, compWidth: number, compHeight: number): World {
  const w = WORLDS[ratio];
  const px = compWidth / w.W;
  const H = compHeight / px;
  return {
    W: w.W,
    H,
    groundY: H * w.ground,
    pad: w.W * 0.08,
    px,
    portrait: compHeight > compWidth,
  };
}

export const stageToWorldX = (world: World, x: number) => world.pad + x * (world.W - 2 * world.pad);
export const stageToWorldY = (world: World, y: number) => y * world.groundY;

/** Offstage positions (stage units) for enter / exit. */
export const OFFSTAGE_LEFT = -0.22;
export const OFFSTAGE_RIGHT = 1.22;
