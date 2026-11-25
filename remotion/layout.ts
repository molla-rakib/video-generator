/**
 * Aspect-ratio layout engine.
 *
 * Compositions are authored at a 1080-pixel base (1080p). Higher export
 * resolutions (1440p, 4K) use Remotion's `scale` option, so every layout
 * number below stays the same for all resolutions.
 */
import type { Ratio } from "../lib/spec/schema";

export type Insets = { top: number; right: number; bottom: number; left: number };

export type RatioLayout = {
  ratio: Ratio;
  width: number;
  height: number;
  /** Area kept clear of platform UI (Shorts/Reels buttons, captions bars, TV overscan). */
  safe: Insets;
  /** Caption block: distance from the bottom of the frame to the caption baseline area. */
  captionBottom: number;
  captionMaxWidth: number;
  captionStyle: "documentary-clean" | "bold-social";
  /** Where the name/title lower-third sits. */
  lowerThird: "bottom-left" | "top-left";
  /** Multiplier for type sizes, tuned per format. */
  type: number;
  /** Is this a portrait-ish format? */
  portrait: boolean;
};

export const RATIO_LAYOUTS: Record<Ratio, RatioLayout> = {
  "16:9": {
    ratio: "16:9",
    width: 1920,
    height: 1080,
    safe: { top: 64, right: 110, bottom: 64, left: 110 },
    captionBottom: 84,
    captionMaxWidth: 1400,
    captionStyle: "documentary-clean",
    lowerThird: "bottom-left",
    type: 1,
    portrait: false,
  },
  "9:16": {
    ratio: "9:16",
    width: 1080,
    height: 1920,
    // Shorts / Reels / TikTok UI: top bar, right action buttons, bottom description.
    safe: { top: 230, right: 150, bottom: 400, left: 70 },
    captionBottom: 560,
    captionMaxWidth: 860,
    captionStyle: "bold-social",
    lowerThird: "top-left",
    type: 1.12,
    portrait: true,
  },
  "1:1": {
    ratio: "1:1",
    width: 1080,
    height: 1080,
    safe: { top: 64, right: 72, bottom: 64, left: 72 },
    captionBottom: 80,
    captionMaxWidth: 920,
    captionStyle: "documentary-clean",
    lowerThird: "bottom-left",
    type: 0.9,
    portrait: false,
  },
  "4:5": {
    ratio: "4:5",
    width: 1080,
    height: 1350,
    safe: { top: 80, right: 72, bottom: 96, left: 72 },
    captionBottom: 130,
    captionMaxWidth: 920,
    captionStyle: "bold-social",
    lowerThird: "bottom-left",
    type: 0.98,
    portrait: true,
  },
};

export function getLayout(ratio: Ratio): RatioLayout {
  return RATIO_LAYOUTS[ratio];
}

/** Export resolutions → Remotion `scale` factor relative to the 1080 base. */
export const RESOLUTIONS = {
  "720p": 720 / 1080,
  "1080p": 1,
  "1440p": 1440 / 1080,
  "4k": 2160 / 1080,
} as const;
export type Resolution = keyof typeof RESOLUTIONS;
