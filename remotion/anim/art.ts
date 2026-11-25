import { createContext, useContext } from "react";
import type { ArtStyle } from "../../lib/spec/schema";

/** How shapes are drawn for each art style. */
export type Art = {
  style: ArtStyle;
  /** Outline color, or null for no outlines. */
  outline: string | null;
  /** Outline width in world units. */
  ow: number;
  /** CSS filter applied to the whole animated scene. */
  filter?: string;
  texture: "none" | "paper" | "grain";
};

export const ARTS: Record<ArtStyle, Art> = {
  flat: { style: "flat", outline: null, ow: 0, texture: "none" },
  storybook: { style: "storybook", outline: "#3d2c25", ow: 3.5, filter: "saturate(0.9) contrast(1.02)", texture: "paper" },
  bold: { style: "bold", outline: "#16131f", ow: 6, filter: "saturate(1.12) contrast(1.04)", texture: "none" },
  retro: { style: "retro", outline: "#2e2a26", ow: 3, filter: "sepia(0.28) saturate(0.82) contrast(1.06)", texture: "grain" },
};

export const ArtContext = createContext<Art>(ARTS.flat);
export const useArt = () => useContext(ArtContext);

/** Spread onto filled SVG shapes to give them the art style's outline. */
export function useOutline(scale = 1): { stroke?: string; strokeWidth?: number; strokeLinejoin?: "round" } {
  const art = useArt();
  return art.outline ? { stroke: art.outline, strokeWidth: art.ow * scale, strokeLinejoin: "round" } : {};
}

// ─── Color helpers ──────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** amount > 0 lightens toward white, < 0 darkens toward black. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const t = amount < 0 ? 0 : 255;
  const a = Math.abs(amount);
  return rgbToHex(r + (t - r) * a, g + (t - g) * a, b + (t - b) * a);
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
