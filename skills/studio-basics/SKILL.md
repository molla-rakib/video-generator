---
name: studio-basics
description: How a project in this studio is built — project.json, scene components, sound levels and the rules for changing them. Read before any change.
---

# Studio basics

You are working **inside one project folder**. The app shows everything in
this folder on an editable timeline. Change files only in here.

```
project.json      the timeline (single source of truth)
scenes/*.tsx      animated scenes (Remotion + React components)
audio/music/      background music
audio/sfx/        sound effects
media/            the user's own uploads — never delete or change these
input/            voiceover and subtitles — never change these
history/ exports/ job/   managed by the app — don't touch
```

## project.json

All times are in **seconds**. Keep every existing `id`. Don't change
`schemaVersion`, `revision` or `updatedBy`; the app manages them.

- `ratio` is the shape being edited. `ratios` lists the shapes the video is
  exported in (`"16:9"`, `"9:16"`, `"4:5"`, `"1:1"`).
- `tracks[]` is ordered top to bottom, and higher visual tracks are drawn in
  front. Each track has `{ id, kind: "video"|"audio"|"text", role, name, muted, solo, hidden, locked, volume }`.
  - `role` is one of `scenes`, `overlay`, `voice`, `music`, `sfx`,
    `ambience`, `other`, `captions` or `titles`.
- `clips[]` each have `{ id, trackId, kind, label, start, duration, ... }`:
  - `kind: "scene"` uses `component: "scenes/Name.tsx"` and
    `props: { … }`. Props are the scene's adjustable parameters.
  - `kind: "audio" | "video" | "image"` uses `src` (a path inside the
    project, such as `audio/sfx/rain.mp3`) plus `sourceStart` and
    `sourceDuration`.
  - `kind: "caption" | "title"` uses `text`.
  - Every clip can set `volume` (0–2), `fadeIn`, `fadeOut`, `transition`,
    `transitionDuration` and `meta` (free notes; put an SFX prompt in
    `meta.prompt`).
  - Visual clips can set `layout: { default: Box|null, byRatio: { "9:16": Box|null } }`.
    A Box is `{x, y, w, h, radius}`, as 0–1 fractions of the frame. `null`
    means full frame.
- Clips on the same track must not overlap.

## Scene components

- One `.tsx` file per shot, with `export default function Scene(props) { … }`.
- Import only `react`, `remotion` and other files inside this project folder
  (for example a shared `scenes/kit.tsx`). Nothing else can be imported.
- Animate with `useCurrentFrame()` and `useVideoConfig()`. Use only
  deterministic randomness: `random("seed")` from remotion, never
  `Math.random()`.
- The app passes `ratio` (`"16:9"` | `"9:16"` | `"4:5"` | `"1:1"`) and
  `durationInFrames` (the shot's own length), plus the clip's `props`.
- **Every scene must look right in all four shapes.** Lay out from
  `useVideoConfig()` width and height, keep characters and key action inside
  a safe area, and re-frame for each shape rather than squeezing.
- Give each adjustable parameter a default and mirror it in the clip's
  `props`. Use numbers, booleans, plain strings or `#rrggbb` colours, so the
  editor can show sliders and pickers for them.
- Keep animating past the shot's end (see the flowing-transitions skill).
- If `scenes/kit.tsx` or other shared files exist, reuse their characters and
  helpers before drawing new ones, so the look stays consistent.
- Use original characters and designs only: no copyrighted characters,
  logos, brands or real people.

## Sound

- The **voice is never edited, moved, re-timed or replaced.**
- Music sits at about half the voice level (`volume` ≈ 0.5). Sound effects
  sit at or below half, and must never cover the narration.
- Put sound effects on the `sfx` track, background loops on `ambience`, and
  music on `music`.

## When asked for a change

- Change **only** what the request is about: the selected clips, or the
  selected time range. Leave everything else exactly as it is.
- Prefer editing the existing scene file. If a scene file is used by other
  clips that shouldn't change, make a copy (`scenes/Name_v2.tsx`) and point
  only the selected clip at it.
- After editing, make sure `project.json` is still valid JSON in the format
  above.
- Finish with one or two plain sentences saying what you changed, written
  for the user.
