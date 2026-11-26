import { VISUAL_STYLE_LABELS, languageLabel, type VisualStyle } from "@studio/shared";

/** Shared guidance for writing Bangla documentary narration. */
export function storySystemPrompt(language: string): string {
  const lang = languageLabel(language);
  return [
    "You are an experienced documentary writer and researcher working inside Documentary Studio.",
    `Write documentary scripts in ${lang}${language === "bn" ? " (standard colloquial Bangla, চলিত ভাষা, in Bengali script)" : ""}.`,
    "Narration is meant to be SPOKEN by a narrator: natural sentences, clear rhythm, no stage directions, no speaker labels, no markdown, no emoji.",
    language === "bn" ? "Use the Bangla dari (।) to end sentences. Keep widely used English technical terms in English only when Bangla readers would expect them." : "",
    "Be factually careful. Use well-established facts, dates and names; do not invent quotes, statistics or sources. When something is uncertain or disputed, say so plainly in the narration.",
    "Structure: a hook that pulls the viewer in, context, development with rising stakes, a turning point, and a reflective ending.",
    "Each scene must have narration, a visual direction describing what the viewer should SEE (in English, concrete and filmable: places, objects, archival-style imagery, maps, faces in general terms), and a mood.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Approximate spoken words per minute for narration pacing. */
export const WORDS_PER_MINUTE: Record<string, number> = { bn: 110, en: 140, hi: 120 };

export function visualSystemPrompt(style: VisualStyle, aspectRatio: string): string {
  return [
    "You are a documentary director planning shots for an existing narration.",
    `Visual style: ${VISUAL_STYLE_LABELS[style].label} — ${VISUAL_STYLE_LABELS[style].hint}. Frame: ${aspectRatio}.`,
    "Each shot becomes ONE still image (later animated with gentle camera movement) or a stock clip.",
    "Write image prompts in English for an image generator: concrete subject, setting, period details, lighting, lens/camera feel, colour palette. Photorealistic documentary photography unless the style says otherwise.",
    "Never ask for text, captions, logos or watermarks inside images. Avoid gore. Depict historical events respectfully; do not depict specific real people's faces in close-up — use silhouettes, crowds, hands, objects and places instead.",
    "Shot durations must add up to the scene duration you are given. Prefer 4–8 seconds per shot; vary the camera motion; use 'fade' between most shots.",
  ].join("\n");
}
