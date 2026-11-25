/**
 * The 2D animation vocabulary: everything Claude can "direct" in a cartoon scene.
 * Every enum here maps 1:1 to a component in remotion/anim — Claude can only
 * use things that actually exist, so generated videos never reference missing art.
 */
import { z } from "zod";

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .describe("Hex color like #3a7bd5");

// ─── Cast (characters stay identical across scenes) ─────────────────────────

export const SKIN_TONES = ["light", "fair", "tan", "brown", "dark"] as const;
export const HAIR_STYLES = ["short", "side-part", "long", "bun", "ponytail", "curly", "spiky", "bald"] as const;
export const OUTFITS = ["casual", "suit", "dress", "astronaut", "scientist", "explorer", "uniform", "robe"] as const;
export const HATS = ["none", "cap", "helmet", "top-hat", "flat-cap", "hard-hat", "crown", "beret"] as const;

export const CharacterLookSchema = z.object({
  skin: z.enum(SKIN_TONES),
  hairStyle: z.enum(HAIR_STYLES),
  hairColor: hex,
  outfit: z.enum(OUTFITS),
  /** Main clothing color (shirt / jacket / dress / robe). */
  topColor: hex,
  /** Trousers / skirt color. */
  bottomColor: hex,
  hat: z.enum(HATS).default("none"),
  glasses: z.boolean().default(false),
  facialHair: z.enum(["none", "mustache", "beard"]).default("none"),
  build: z.enum(["slim", "average", "broad"]).default("average"),
  /** 0.6 = small child, 1 = adult, 1.15 = tall adult. */
  height: z.number().min(0.55).max(1.2).default(1),
});
export type CharacterLook = z.infer<typeof CharacterLookSchema>;

export const CastMemberSchema = z.object({
  id: z.string().describe("Short id used by scenes, e.g. 'orville'"),
  name: z.string(),
  look: CharacterLookSchema,
});
export type CastMember = z.infer<typeof CastMemberSchema>;

// ─── Expressions & actions ──────────────────────────────────────────────────

export const EXPRESSIONS = ["neutral", "happy", "excited", "sad", "surprised", "angry", "worried", "thinking"] as const;
export type Expression = (typeof EXPRESSIONS)[number];

export const CHARACTER_ACTIONS = [
  "idle",
  "enter", // walk in from off-stage (use `from`) to `x`
  "exit", // walk off-stage (use `to`)
  "walk-to", // walk to `x`
  "run-to", // run to `x`
  "talk", // gestures + moving mouth
  "wave",
  "point", // arm stretched toward facing direction
  "cheer", // arms up, little hops
  "think", // hand on chin
  "jump",
  "nod",
  "shrug",
  "look-up",
  "dance",
  "turn", // flip facing direction
] as const;
export type CharacterActionName = (typeof CHARACTER_ACTIONS)[number];

export const CharacterActionSchema = z.object({
  at: z.number().min(0).describe("Seconds from the start of the scene"),
  do: z.enum(CHARACTER_ACTIONS),
  duration: z.number().positive().optional().describe("Seconds; movement and gestures default to sensible lengths"),
  x: z.number().min(0).max(1).optional().describe("Target stage x for walk-to / run-to / enter (0 = left, 1 = right)"),
  from: z.enum(["left", "right"]).optional().describe("enter: which side to come from"),
  to: z.enum(["left", "right"]).optional().describe("exit: which side to leave by"),
  expression: z.enum(EXPRESSIONS).optional().describe("Change facial expression at this moment"),
});
export type CharacterAction = z.infer<typeof CharacterActionSchema>;

// ─── Props ──────────────────────────────────────────────────────────────────

export const PROPS = [
  "rocket",
  "biplane",
  "airplane",
  "car",
  "boat",
  "tree",
  "pine-tree",
  "house",
  "skyscraper",
  "flag",
  "globe",
  "lightbulb",
  "book",
  "sign",
  "telescope",
  "satellite",
  "campfire",
  "lander",
  "planet",
  "laptop",
  "crate",
  "bicycle",
  "capsule", // space capsule; parachutes open while it moves (descends)
] as const;
export type PropName = (typeof PROPS)[number];

export const PROP_ACTIONS = [
  "pop-in", // springs into view
  "fade-in",
  "move-to", // glide to x / y
  "fly-across", // flies across the stage in the `to` direction
  "float", // gentle hover from now on
  "spin",
  "launch", // rockets: ignite + lift off; vehicles: take off upward
  "shake",
  "pulse",
  "exit", // pop out of view
] as const;

export const PropActionSchema = z.object({
  at: z.number().min(0),
  do: z.enum(PROP_ACTIONS),
  duration: z.number().positive().optional(),
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1.2).optional(),
  to: z.enum(["left", "right"]).optional(),
});
export type PropAction = z.infer<typeof PropActionSchema>;

// ─── Scene elements ─────────────────────────────────────────────────────────

const stageX = z.number().min(0).max(1).describe("Stage x: 0 = left edge, 1 = right edge");
const stageY = z
  .number()
  .min(0)
  .max(1.2)
  .describe("Stage y: 1 = standing on the ground, 0.5 = mid-sky, 0.1 = top of the frame");

export const CharacterElementSchema = z.object({
  type: z.literal("character"),
  id: z.string().describe("Element id, unique in the scene; speech bubbles point at it"),
  castId: z.string().describe("Which cast member this is"),
  x: stageX,
  facing: z.enum(["left", "right"]).default("right"),
  scale: z.number().min(0.3).max(2.5).default(1),
  expression: z.enum(EXPRESSIONS).default("neutral"),
  /** Hidden until its first action at > 0 (e.g. an `enter`). */
  hiddenUntilFirstAction: z.boolean().default(false),
  actions: z.array(CharacterActionSchema).default([]),
});

export const PropElementSchema = z.object({
  type: z.literal("prop"),
  id: z.string(),
  prop: z.enum(PROPS),
  x: stageX,
  y: stageY.default(1),
  scale: z.number().min(0.2).max(4).default(1),
  color: hex.optional().describe("Main color override"),
  label: z.string().max(24).optional().describe("Text for 'sign' / 'book' / 'flag'"),
  flip: z.boolean().default(false),
  /** Hidden until its first action at > 0 (e.g. pop-in). */
  hiddenUntilFirstAction: z.boolean().default(false),
  actions: z.array(PropActionSchema).default([]),
});

export const SpeechElementSchema = z.object({
  type: z.literal("speech"),
  characterId: z.string().describe("Element id of the speaking character"),
  text: z.string().max(90),
  at: z.number().min(0),
  duration: z.number().positive().default(2.5),
  kind: z.enum(["speech", "thought", "shout"]).default("speech"),
});

export const TextElementSchema = z.object({
  type: z.literal("text"),
  text: z.string().max(60),
  style: z.enum(["title", "label", "year", "caption"]).default("label"),
  x: stageX.default(0.5),
  y: stageY.default(0.2),
  at: z.number().min(0).default(0),
  duration: z.number().positive().optional(),
});

export const CounterElementSchema = z.object({
  type: z.literal("counter"),
  value: z.number(),
  decimals: z.number().int().min(0).max(2).default(0),
  prefix: z.string().default(""),
  suffix: z.string().default(""),
  label: z.string().max(60),
  x: stageX.default(0.5),
  y: stageY.default(0.35),
  at: z.number().min(0).default(0),
});

export const TimelineElementSchema = z.object({
  type: z.literal("timeline"),
  events: z
    .array(z.object({ label: z.string().max(14).describe("Usually a year"), caption: z.string().max(28) }))
    .min(2)
    .max(6),
  y: stageY.default(0.42),
  at: z.number().min(0).default(0),
  /** Seconds between events appearing. */
  step: z.number().positive().default(0.9),
});

export const EFFECTS = ["stars", "rain", "snow", "confetti", "sparkles", "dust", "smoke", "fireflies", "bubbles"] as const;

export const EffectElementSchema = z.object({
  type: z.literal("effect"),
  effect: z.enum(EFFECTS),
  at: z.number().min(0).default(0),
  duration: z.number().positive().optional(),
  intensity: z.number().min(0.2).max(2).default(1),
});

export const AnimElementSchema = z.discriminatedUnion("type", [
  CharacterElementSchema,
  PropElementSchema,
  SpeechElementSchema,
  TextElementSchema,
  CounterElementSchema,
  TimelineElementSchema,
  EffectElementSchema,
]);
export type AnimElement = z.infer<typeof AnimElementSchema>;
export type CharacterElement = z.infer<typeof CharacterElementSchema>;
export type PropElement = z.infer<typeof PropElementSchema>;

// ─── Backgrounds & camera ───────────────────────────────────────────────────

export const BACKGROUNDS = [
  "meadow",
  "forest",
  "mountains",
  "city",
  "desert",
  "beach", // tropical: palm tree
  "dunes", // sand dunes with beach grass and distant sea (no palms)
  "ocean",
  "space",
  "moon",
  "room",
  "workshop",
  "studio",
] as const;
export type BackgroundName = (typeof BACKGROUNDS)[number];

export const TIMES_OF_DAY = ["day", "sunset", "night"] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export const CAMERA_MOVES = ["static", "push-in", "pull-out", "pan-left", "pan-right", "follow"] as const;

export const AnimationVisualSchema = z.object({
  type: z.literal("animation"),
  background: z.object({
    scene: z.enum(BACKGROUNDS),
    time: z.enum(TIMES_OF_DAY).default("day"),
  }),
  camera: z
    .object({
      move: z.enum(CAMERA_MOVES).default("static"),
      target: z.string().optional().describe("Element id to follow / push in on"),
    })
    .default({ move: "static" }),
  elements: z.array(AnimElementSchema).default([]),
});
export type AnimationVisual = z.infer<typeof AnimationVisualSchema>;
