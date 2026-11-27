import { z } from "zod";

/**
 * Video formats shared by the editor, the renderer and the export dialog.
 */

export const ASPECT_RATIOS = ["16:9", "9:16", "4:5", "1:1"] as const;
export const AspectRatioSchema = z.enum(ASPECT_RATIOS);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

export const ASPECT_RATIO_LABELS: Record<AspectRatio, { name: string; hint: string }> = {
  "16:9": { name: "Widescreen", hint: "YouTube, TV" },
  "9:16": { name: "Vertical", hint: "Shorts, Reels, TikTok" },
  "4:5": { name: "Portrait", hint: "Instagram feed" },
  "1:1": { name: "Square", hint: "Social feeds" },
};

/** Named by the SHORT side of the frame (1080p = 1920×1080 or 1080×1920). */
export const RESOLUTIONS = ["720p", "1080p", "1440p", "2160p"] as const;
export const ResolutionSchema = z.enum(RESOLUTIONS);
export type Resolution = z.infer<typeof ResolutionSchema>;

export const RESOLUTION_LABELS: Record<Resolution, string> = {
  "720p": "720p",
  "1080p": "1080p (Full HD)",
  "1440p": "1440p (2K)",
  "2160p": "2160p (4K)",
};

const SHORT_SIDE: Record<Resolution, number> = { "720p": 720, "1080p": 1080, "1440p": 1440, "2160p": 2160 };

/** Pixel dimensions for an aspect ratio at a given quality (always even, for H.264). */
export function dimensionsFor(aspectRatio: AspectRatio, resolution: Resolution): { width: number; height: number } {
  const short = SHORT_SIDE[resolution];
  const even = (n: number) => Math.round(n / 2) * 2;
  switch (aspectRatio) {
    case "16:9":
      return { width: even((short * 16) / 9), height: short };
    case "9:16":
      return { width: short, height: even((short * 16) / 9) };
    case "4:5":
      return { width: short, height: even((short * 5) / 4) };
    case "1:1":
      return { width: short, height: short };
  }
}

export const FPS_OPTIONS = [24, 25, 30, 60] as const;
export const FpsSchema = z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]);
export type Fps = z.infer<typeof FpsSchema>;

/** Common languages offered in the UI. Stored as BCP-47 codes. */
export const LANGUAGES = [
  { code: "bn", label: "Bengali" },
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "ar", label: "Arabic" },
  { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" },
] as const;

export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
