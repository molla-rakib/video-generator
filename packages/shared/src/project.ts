import { z } from "zod";

/**
 * Production status of a documentary project. The order matters: it is the
 * order a project moves through, and is used to compute progress.
 * `failed` sits outside the linear flow.
 */
export const PROJECT_STATUSES = [
  "draft",
  "story_approved",
  "audio_in_progress",
  "audio_review",
  "audio_locked",
  "video_in_progress",
  "ready_to_render",
  "completed",
  "failed",
] as const;
export const ProjectStatusSchema = z.enum(PROJECT_STATUSES);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  story_approved: "Story Approved",
  audio_in_progress: "Audio In Progress",
  audio_review: "Audio Review",
  audio_locked: "Audio Locked",
  video_in_progress: "Video In Progress",
  ready_to_render: "Ready to Render",
  completed: "Completed",
  failed: "Failed",
};

const LINEAR_STATUSES = PROJECT_STATUSES.filter((s) => s !== "failed");

/**
 * Progress through the production flow as a whole number 0–100.
 * A failed project returns null because its position is unknown from the
 * status alone — the UI should show the failure instead of a bar.
 */
export function projectProgress(status: ProjectStatus): number | null {
  if (status === "failed") return null;
  const index = LINEAR_STATUSES.indexOf(status);
  return Math.round((index / (LINEAR_STATUSES.length - 1)) * 100);
}

export const ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
export const AspectRatioSchema = z.enum(ASPECT_RATIOS);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

export const ASPECT_RATIO_LABELS: Record<AspectRatio, string> = {
  "16:9": "Widescreen (16:9) — YouTube, TV",
  "9:16": "Vertical (9:16) — Shorts, Reels, TikTok",
  "1:1": "Square (1:1) — social feeds",
};

export const RESOLUTIONS = ["1080p", "720p"] as const;
export const ResolutionSchema = z.enum(RESOLUTIONS);
export type Resolution = z.infer<typeof ResolutionSchema>;

/** Pixel dimensions for an aspect ratio at a given quality. */
export function dimensionsFor(
  aspectRatio: AspectRatio,
  resolution: Resolution,
): { width: number; height: number } {
  const short = resolution === "1080p" ? 1080 : 720;
  const long = resolution === "1080p" ? 1920 : 1280;
  switch (aspectRatio) {
    case "16:9":
      return { width: long, height: short };
    case "9:16":
      return { width: short, height: long };
    case "1:1":
      return { width: short, height: short };
  }
}

export const FPS_OPTIONS = [24, 25, 30] as const;
export const FpsSchema = z.union([z.literal(24), z.literal(25), z.literal(30)]);
export type Fps = z.infer<typeof FpsSchema>;

export const VISUAL_STYLES = [
  "cinematic_realism",
  "documentary",
  "historical",
  "minimalist",
  "dramatic",
  "educational",
] as const;
export const VisualStyleSchema = z.enum(VISUAL_STYLES);
export type VisualStyle = z.infer<typeof VisualStyleSchema>;

export const VISUAL_STYLE_LABELS: Record<VisualStyle, { label: string; hint: string }> = {
  cinematic_realism: { label: "Cinematic Realism", hint: "Film-like, natural light, shallow depth" },
  documentary: { label: "Documentary", hint: "Grounded, observational, true-to-life" },
  historical: { label: "Historical", hint: "Archival textures and period atmosphere" },
  minimalist: { label: "Minimalist", hint: "Clean frames, few elements, lots of space" },
  dramatic: { label: "Dramatic", hint: "High contrast, bold moods, tension" },
  educational: { label: "Educational", hint: "Clear, explanatory, diagram-friendly" },
};

export const NARRATION_PREFERENCES = [
  "male_voice",
  "female_voice",
  "no_preference",
  "no_narration",
] as const;
export const NarrationPreferenceSchema = z.enum(NARRATION_PREFERENCES);
export type NarrationPreference = z.infer<typeof NarrationPreferenceSchema>;

export const NARRATION_PREFERENCE_LABELS: Record<NarrationPreference, string> = {
  male_voice: "Male narrator",
  female_voice: "Female narrator",
  no_preference: "Let the studio choose",
  no_narration: "No narrator (dialogue and visuals only)",
};

/** Common languages offered in the UI. Stored as BCP-47 codes. */
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "bn", label: "Bengali" },
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

/** Approximate target durations offered in the creation form (seconds). */
export const DURATION_OPTIONS = [
  { seconds: 60, label: "About 1 minute" },
  { seconds: 180, label: "About 3 minutes" },
  { seconds: 300, label: "About 5 minutes" },
  { seconds: 600, label: "About 10 minutes" },
  { seconds: 900, label: "About 15 minutes" },
  { seconds: 1200, label: "About 20 minutes" },
] as const;
