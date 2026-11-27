---
name: flowing-transitions
description: When and how one shot should transform into the next — only when the two shots really connect; otherwise a clean cut. Use for every change from one shot to the next.
---

# Flowing transitions

Transforming one shot into the next makes a cartoon feel like one continuous
camera, but **only when the two shots are really connected**. Forcing a
morph between two unrelated pictures looks like a smudge. Decide for each
pair of shots.

## 1. Do these two shots connect?

They connect when at least one of these is true:

- They are **the same place or the same moment**: a closer or wider view, the
  other side of the room, or time passing in the same spot.
- **The camera can travel from one into the other**: through a window or a
  door, into an eye, a screen, a photo or a book.
- **Something matches**: a shape (round moon → round clock), a movement (a
  ball thrown → a ball caught), a colour or light (a lamp's glow → sunrise),
  or the same character holding the same pose.

If **none** of these is true, use a **clean cut** (`transition: "none"`).
That is the normal choice between unrelated shots, and it always looks
better than a forced morph.

## 2. When they connect, transform inside the scenes (best)

- Spend the last 0.6–1 s of shot N moving toward the shared element (push in
  on the window, follow the moving ball).
- Start shot N+1 from that same framing, then reveal the new place.
- Draw shared elements with the **same component** (import it from a shared
  file in `scenes/`), so they match exactly.
- The cut itself can then be invisible (`"none"`), because the scenes already
  line up.

## 3. Editor transitions, used sparingly

Use these only for a connected pair that can't be matched inside the scenes.
Set them on the **incoming** clip in `project.json`, with `transition` and
`transitionDuration`:

| `transition` | Only when |
|---|---|
| `zoom_through` | The camera really goes into something: a window, a memory, a dream. |
| `morph` | The same place changes state: day → night, or calm → storm in the same spot. |
| `whip` | Fast energy between two related moments: a chase, comedy. |
| `iris` | Closing in on one detail or character. |
| `fade` | The very end, or a long time jump the narration names ("years later…"). |

The outgoing shot keeps playing underneath during the transition, so every
scene must keep animating past its own end and must never freeze or go
blank.

## Rules

- When unsure, **cut**.
- Never let a transition hide the visual reaction to the key word. Reactions
  land on or just before their word.
- Keep transitions 0.4–1.0 s long, and at most a third of the shorter of the
  two shots.
- Put the cut or transition on the phrase boundary between two subtitle cues.
- The voice track is never moved or re-timed to make a transition fit.
