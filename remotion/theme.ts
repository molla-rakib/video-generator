import { loadFont as loadCormorant } from "@remotion/google-fonts/CormorantGaramond";
import { loadFont as loadFredoka } from "@remotion/google-fonts/Fredoka";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadOswald } from "@remotion/google-fonts/Oswald";
import type { Style } from "../lib/spec/schema";

const fredoka = loadFredoka("normal", { weights: ["500", "600", "700"], subsets: ["latin"] });
const cormorant = loadCormorant("normal", { weights: ["500", "600", "700"], subsets: ["latin"] });
// Italic is used by quote cards (same family name, so no variable needed).
loadCormorant("italic", { weights: ["500"], subsets: ["latin"] });
const inter = loadInter("normal", { weights: ["400", "500", "600", "800"], subsets: ["latin"] });
const oswald = loadOswald("normal", { weights: ["500", "600"], subsets: ["latin"] });

export type Theme = {
  headingFont: string;
  headingWeight: number;
  headingTransform: "none" | "uppercase";
  headingTracking: string;
  bodyFont: string;
  captionFont: string;
  /** Italic serif used for quotations in every style. */
  quoteFont: string;
  accent: string;
  text: string;
  muted: string;
  background: string;
  panel: string;
};

/** Rounded, friendly font used inside animated scenes (speech bubbles, labels). */
export const CARTOON_FONT = fredoka.fontFamily;

const THEMES: Record<Style["preset"], Theme> = {
  cartoon: {
    headingFont: fredoka.fontFamily,
    headingWeight: 700,
    headingTransform: "none",
    headingTracking: "0em",
    bodyFont: fredoka.fontFamily,
    captionFont: fredoka.fontFamily,
    quoteFont: cormorant.fontFamily,
    accent: "#ffc93c",
    text: "#ffffff",
    muted: "rgba(255,255,255,0.78)",
    background: "#1d1b3a",
    panel: "rgba(29,27,58,0.72)",
  },
  "history-classic": {
    headingFont: cormorant.fontFamily,
    headingWeight: 600,
    headingTransform: "none",
    headingTracking: "0.01em",
    bodyFont: inter.fontFamily,
    captionFont: inter.fontFamily,
    quoteFont: cormorant.fontFamily,
    accent: "#d6a75c",
    text: "#f6efe3",
    muted: "rgba(246,239,227,0.72)",
    background: "#0d0b09",
    panel: "rgba(13,11,9,0.62)",
  },
  "modern-clean": {
    headingFont: inter.fontFamily,
    headingWeight: 800,
    headingTransform: "none",
    headingTracking: "-0.02em",
    bodyFont: inter.fontFamily,
    captionFont: inter.fontFamily,
    quoteFont: cormorant.fontFamily,
    accent: "#5cc8ff",
    text: "#ffffff",
    muted: "rgba(255,255,255,0.72)",
    background: "#06080d",
    panel: "rgba(6,8,13,0.6)",
  },
  "dark-cinematic": {
    headingFont: oswald.fontFamily,
    headingWeight: 600,
    headingTransform: "uppercase",
    headingTracking: "0.08em",
    bodyFont: inter.fontFamily,
    captionFont: inter.fontFamily,
    quoteFont: cormorant.fontFamily,
    accent: "#e5484d",
    text: "#f4f4f5",
    muted: "rgba(244,244,245,0.7)",
    background: "#050505",
    panel: "rgba(5,5,5,0.64)",
  },
};

export function getTheme(style: Style): Theme {
  return THEMES[style.preset];
}

/** CSS filter for each color grade. */
export function gradeFilter(grade: Style["grade"]): string | undefined {
  switch (grade) {
    case "archival":
      return "sepia(0.42) contrast(1.06) brightness(0.96) saturate(0.85)";
    case "warm":
      return "sepia(0.15) saturate(1.08) contrast(1.03)";
    case "cool":
      return "saturate(0.9) hue-rotate(-8deg) contrast(1.04)";
    case "bw":
      return "grayscale(1) contrast(1.12)";
    default:
      return undefined;
  }
}
