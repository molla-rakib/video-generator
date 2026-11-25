/**
 * DocSpec — the single source of truth for a documentary.
 *
 * Claude (later) writes this JSON; the Remotion renderer plays it back.
 * Everything here must stay JSON-serializable (it is passed as Remotion inputProps).
 *
 * NOTE: imports in lib/spec and remotion/ must stay relative (no "@/"),
 * because the Remotion CLI bundles these files with its own bundler.
 */
import { z } from "zod";
import { AnimationVisualSchema, CastMemberSchema } from "./animation";

// ─── Aspect ratios ──────────────────────────────────────────────────────────

export const RATIOS = ["16:9", "9:16", "1:1", "4:5"] as const;
export const RatioSchema = z.enum(RATIOS);
export type Ratio = z.infer<typeof RatioSchema>;

// ─── Ledgers ────────────────────────────────────────────────────────────────

export const SourceSchema = z.object({
  id: z.string(),
  url: z.url(),
  title: z.string(),
  publisher: z.string(),
  /** Short supporting excerpt from the source. */
  excerpt: z.string().optional(),
});
export type Source = z.infer<typeof SourceSchema>;

export const FocusPointSchema = z.object({
  /** 0 = left edge, 1 = right edge */
  x: z.number().min(0).max(1),
  /** 0 = top edge, 1 = bottom edge */
  y: z.number().min(0).max(1),
});
export type FocusPoint = z.infer<typeof FocusPointSchema>;

/** A region of an image (normalized 0..1) that must stay fully visible when cropping. */
export const SubjectBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});
export type SubjectBox = z.infer<typeof SubjectBoxSchema>;

export const MEDIA_ORIGINS = [
  "wikimedia-commons",
  "nasa",
  "library-of-congress",
  "smithsonian",
  "pexels",
  "pixabay",
  "user-upload",
  "ai-illustration",
] as const;

export const MediaItemSchema = z.object({
  id: z.string(),
  kind: z.enum(["image"]),
  /** Absolute URL, or a path relative to /public (e.g. "media/samples/x.jpg"). */
  src: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  title: z.string(),
  origin: z.enum(MEDIA_ORIGINS),
  pageUrl: z.url().optional(),
  license: z.string(),
  licenseUrl: z.string().optional(),
  author: z.string(),
  attribution: z.string(),
  /** AI-generated media is always labelled "Illustration" on screen. */
  aiGenerated: z.boolean().default(false),
  /** Where the camera centers, so crops keep the subject in frame in every aspect ratio. */
  focus: FocusPointSchema.default({ x: 0.5, y: 0.5 }),
  /**
   * The part of the image that must never be cropped away (e.g. all faces in a group photo).
   * If a crop for the current aspect ratio can't contain it, the image is shown whole instead.
   */
  subject: SubjectBoxSchema.optional(),
});
export type MediaItem = z.infer<typeof MediaItemSchema>;

// ─── Scene building blocks ──────────────────────────────────────────────────

export const CameraMoveSchema = z.enum([
  "push-in",
  "pull-out",
  "pan-left",
  "pan-right",
  "pan-up",
  "pan-down",
  "still",
]);
export type CameraMove = z.infer<typeof CameraMoveSchema>;

export const PhotoVisualSchema = z.object({
  type: z.literal("photo"),
  mediaId: z.string(),
  motion: CameraMoveSchema.default("push-in"),
  /** Override the media item's focus point / subject box for this scene. */
  focus: FocusPointSchema.optional(),
  subject: SubjectBoxSchema.optional(),
  /**
   * cover   = fill the frame (crop around the focus point)
   * contain = show the whole image over a blurred copy of itself
   * auto    = cover, unless that would crop into the subject box (or, without one,
   *           crop away more than half the image)
   */
  fit: z.enum(["auto", "cover", "contain"]).default("auto"),
});

export const QuoteVisualSchema = z.object({
  type: z.literal("quote"),
  text: z.string(),
  attribution: z.string(),
  /** Optional background image (shown dimmed + blurred). */
  mediaId: z.string().optional(),
});

export const StatVisualSchema = z.object({
  type: z.literal("stat"),
  value: z.number(),
  decimals: z.number().int().min(0).max(3).default(0),
  prefix: z.string().default(""),
  suffix: z.string().default(""),
  label: z.string(),
  mediaId: z.string().optional(),
});

export const VisualSchema = z.discriminatedUnion("type", [
  AnimationVisualSchema,
  PhotoVisualSchema,
  QuoteVisualSchema,
  StatVisualSchema,
]);
export type Visual = z.infer<typeof VisualSchema>;

export const OverlaySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("lower-third"), title: z.string(), subtitle: z.string().optional() }),
  z.object({ type: z.literal("date"), text: z.string() }),
  z.object({ type: z.literal("location"), text: z.string() }),
]);
export type Overlay = z.infer<typeof OverlaySchema>;

export const ClaimSchema = z.object({
  text: z.string(),
  sourceIds: z.array(z.string()).min(1),
  status: z.enum(["verified", "disputed", "unsupported"]),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const TransitionSchema = z.object({
  type: z.enum(["dissolve", "dip-to-black", "cut"]),
  durationSec: z.number().min(0).max(3).default(0.8),
});
export type Transition = z.infer<typeof TransitionSchema>;

export const SceneSchema = z.object({
  id: z.string(),
  /** Narration line(s) for this scene; also drives captions and timing. */
  narration: z.string().default(""),
  /** Minimum on-screen time. The real length is at least the narration length. */
  durationSec: z.number().positive().optional(),
  claims: z.array(ClaimSchema).default([]),
  visual: VisualSchema,
  overlays: z.array(OverlaySchema).default([]),
  /** Transition into the NEXT segment. */
  transition: TransitionSchema.default({ type: "dissolve", durationSec: 0.8 }),
});
export type Scene = z.infer<typeof SceneSchema>;

export const ChapterSchema = z.object({
  id: z.string(),
  title: z.string(),
  showTitleCard: z.boolean().default(true),
  scenes: z.array(SceneSchema).min(1),
});
export type Chapter = z.infer<typeof ChapterSchema>;

// ─── Style ──────────────────────────────────────────────────────────────────

export const STYLE_PRESETS = ["cartoon", "history-classic", "modern-clean", "dark-cinematic"] as const;
export const GRADES = ["none", "archival", "warm", "cool", "bw"] as const;
/** How 2D animation is drawn: outlines, texture and color treatment. */
export const ART_STYLES = ["flat", "storybook", "bold", "retro"] as const;
export type ArtStyle = (typeof ART_STYLES)[number];

export const StyleSchema = z.object({
  /** Typography + title-card look. */
  preset: z.enum(STYLE_PRESETS).default("cartoon"),
  /** Drawing style of animated scenes. */
  art: z.enum(ART_STYLES).default("flat"),
  grade: z.enum(GRADES).default("none"),
  grain: z.boolean().default(false),
});
export type Style = z.infer<typeof StyleSchema>;

// ─── DocSpec ────────────────────────────────────────────────────────────────

export const DocSpecSchema = z
  .object({
    version: z.literal(1),
    meta: z.object({
      title: z.string(),
      subtitle: z.string().optional(),
      language: z.string().default("en"),
      fps: z.number().int().min(24).max(60).default(30),
    }),
    style: StyleSchema.default({ preset: "cartoon", art: "flat", grade: "none", grain: false }),
    /** Characters used by animated scenes; defined once so they look identical everywhere. */
    cast: z.array(CastMemberSchema).default([]),
    captions: z
      .object({
        enabled: z.boolean().default(true),
        /** auto = clean captions for 16:9 / 1:1, bold word-highlight captions for 9:16 / 4:5 */
        style: z.enum(["auto", "documentary-clean", "bold-social"]).default("auto"),
      })
      .default({ enabled: true, style: "auto" }),
    chapters: z.array(ChapterSchema).min(1),
    endCard: z
      .object({
        showSources: z.boolean().default(true),
        showCredits: z.boolean().default(true),
      })
      .default({ showSources: true, showCredits: true }),
    sources: z.array(SourceSchema).default([]),
    media: z.array(MediaItemSchema).default([]),
  })
  .superRefine((spec, ctx) => {
    // Referential integrity: every mediaId / sourceId must exist in the ledgers.
    const mediaIds = new Set(spec.media.map((m) => m.id));
    const sourceIds = new Set(spec.sources.map((s) => s.id));
    const castIds = new Set(spec.cast.map((c) => c.id));
    const sceneIds = new Set<string>();

    spec.chapters.forEach((chapter, ci) => {
      chapter.scenes.forEach((scene, si) => {
        const path = ["chapters", ci, "scenes", si];
        if (sceneIds.has(scene.id)) {
          ctx.addIssue({ code: "custom", path: [...path, "id"], message: `Duplicate scene id "${scene.id}"` });
        }
        sceneIds.add(scene.id);

        const mediaId = "mediaId" in scene.visual ? scene.visual.mediaId : undefined;
        if (mediaId && !mediaIds.has(mediaId)) {
          ctx.addIssue({ code: "custom", path: [...path, "visual", "mediaId"], message: `Unknown mediaId "${mediaId}"` });
        }
        if (scene.visual.type === "animation") {
          const elements = scene.visual.elements;
          const elementIds = new Set<string>();
          elements.forEach((el, k) => {
            const elPath = [...path, "visual", "elements", k];
            if (el.type === "character" || el.type === "prop") {
              if (elementIds.has(el.id)) ctx.addIssue({ code: "custom", path: elPath, message: `Duplicate element id "${el.id}"` });
              elementIds.add(el.id);
            }
            if (el.type === "character" && !castIds.has(el.castId)) {
              ctx.addIssue({ code: "custom", path: [...elPath, "castId"], message: `Unknown castId "${el.castId}" (add it to "cast")` });
            }
          });
          elements.forEach((el, k) => {
            if (el.type === "speech" && !elements.some((e) => e.type === "character" && e.id === el.characterId)) {
              ctx.addIssue({
                code: "custom",
                path: [...path, "visual", "elements", k, "characterId"],
                message: `Speech bubble points at "${el.characterId}", which is not a character element in this scene`,
              });
            }
          });
          const target = scene.visual.camera.target;
          if (target && !elementIds.has(target)) {
            ctx.addIssue({ code: "custom", path: [...path, "visual", "camera", "target"], message: `Camera target "${target}" is not an element id` });
          }
        }
        scene.claims.forEach((claim, k) => {
          for (const id of claim.sourceIds) {
            if (!sourceIds.has(id)) {
              ctx.addIssue({ code: "custom", path: [...path, "claims", k], message: `Unknown sourceId "${id}"` });
            }
          }
        });
      });
    });
  });

/** What authors / Claude write (defaults optional). */
export type DocSpecInput = z.input<typeof DocSpecSchema>;
/** What the renderer receives (defaults applied). */
export type DocSpec = z.output<typeof DocSpecSchema>;

export function parseDocSpec(input: unknown): DocSpec {
  return DocSpecSchema.parse(input);
}
