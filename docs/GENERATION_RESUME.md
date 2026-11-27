# Problem: "Start animating" restarts from the beginning after a failure or Stop

**Status:** known bug, not fixed yet.
**Area:** worker job `agent.generate` ([apps/worker/src/jobs/generate.ts](../apps/worker/src/jobs/generate.ts)) and the Claude Code runner ([packages/providers/src/claude-code-agent.ts](../packages/providers/src/claude-code-agent.ts)).

---

## 1. What the user sees

Start animating runs four phases:

1. **Understanding the story:** reads `input/subtitles.json` and writes `plan/scene_plan.json`.
2. **Building the scenes:** writes `scenes/*.tsx` and `plan/shots.json`.
3. **Checking its work:** renders preview stills that Claude reviews.
4. **Sound effects and music.**

If the run fails, or the user presses **Stop**, pressing **Start animating** again starts over at phase 1. Claude re-reads the subtitles, re-plans the story and rebuilds the scenes it had already written.

On a long story (for example 6½ minutes with 74 subtitle lines), phases 1–2 take 30–60+ minutes and a large share of the user's Claude plan. Losing that work to one failure late in the run, or to a single Stop, is costly and frustrating.

**Expected behaviour:** the run continues from where it stopped. Finished phases are kept, and inside phase 2 the scenes already written are kept. Claude continues its own session, so it doesn't re-read everything.

---

## 2. Why it happens (root causes)

### 2.1 Resume is all-or-nothing

```ts
// generate.ts
const resumed = Boolean(plan && !problems.length && built.shotsFile && !built.problems.length);
```

The run skips work only when **both** of these hold:
- `plan/scene_plan.json` is valid, **and**
- `plan/shots.json` exists, covers every shot, and every component compiles.

So:

| Where it stopped | What's on disk | What happens on restart |
|---|---|---|
| During phase 1 | Nothing, or a half plan | Full restart (expected) |
| **After phase 1, during phase 2** | Valid plan, some `scenes/*.tsx`, **no `shots.json` yet** | **Full restart: the plan is thrown away and redone** |
| Phase 2 done, one component doesn't compile | Valid plan, all scenes, `shots.json` | **Full restart** instead of fixing one file |
| During phase 3 or 4 | Everything from phases 1–2 | Resumes (works) |

Claude writes `plan/shots.json` **last** in phase 2, so most real stops and failures land in the second row.

### 2.2 Every Claude call is a brand-new session

The runner starts Claude Code with `--no-session-persistence`. Each `agent()` call (plan, fix the plan, build, fix the scenes, review) is a fresh conversation. Claude has to re-read `input/subtitles.json`, the plan, the skills and the existing scene files every time. A session cut off by Stop or a crash can't be continued at all.

### 2.3 Phase 2 has no checkpoints inside it

Phase 2 is one long Claude session that writes many files: the kit, the characters, one component per place, then `shots.json`. Nothing records which files are finished and valid. On restart, the build prompt only says "some files already exist in scenes/, reuse them when they fit". Claude may re-read and rewrite them anyway.

### 2.4 The UI and the queue don't know about phases

- The progress panel always starts at step 1.
- **Retry** in the Tasks menu re-queues the same job input, which behaves exactly like a fresh start.
- Nothing tells the user "this will resume from Building the scenes, and these 5 of 8 places are already done".

### 2.5 What already works (keep it)

- On failure or Stop, the job restores **only `project.json`** and keeps `plan/` and `scenes/`. See `restoreProjectBackup(…, { scenes: false })`. The files survive; they just aren't reused (see 2.1).
- When both `scene_plan.json` and `shots.json` are valid, the run skips to phase 3. This was tested and works.

---

## 3. Proposed fix

### 3.1 A progress file per project

Add `plan/progress.json`, written by the worker after every step that finishes. This is the single place that says what's done.

```jsonc
{
  "version": 1,
  "inputs": {
    "subtitlesHash": "sha256 of input/subtitles.json",
    "voiceHash": "sha256 of input/voice.*",
    "referencesHash": "sha256 of the sorted list + sizes in input/references, input/assets",
    "style": "2d-cartoon",
    "notes": "user's extra direction"
  },
  "phases": {
    "plan":   { "status": "done", "hash": "sha256 of plan/scene_plan.json", "sessionId": "uuid", "finishedAt": "…" },
    "build":  {
      "status": "running",
      "sessionId": "uuid",
      "components": {
        "scenes/kit.tsx":                 { "status": "done", "hash": "…" },
        "scenes/characters/Emon.tsx":     { "status": "done", "hash": "…" },
        "scenes/InterviewRoom.tsx":       { "status": "done", "hash": "…" },
        "scenes/CampusGate.tsx":          { "status": "todo" }
      },
      "shotsFile": null
    },
    "review": { "status": "todo" },
    "sound":  { "status": "todo", "sfxDone": ["s01-0"], "musicDone": [] }
  }
}
```

**Rules:**
- A phase counts as `done` only if its output still validates, and its `hash` matches the file on disk. If the user edits a file by hand, that phase runs again.
- **Invalidation flows downstream:**
  - If `subtitlesHash`, `voiceHash`, `style` or `notes` change, redo everything from the plan.
  - If the plan changes, redo the build, review and sound.
  - If one component changes, redo the review only.
- The sound phase records each sound effect and music part it has already made, so a retry doesn't pay ElevenLabs twice.

### 3.2 Resume each phase on its own

Replace the single `resumed` flag with a per-phase decision:

```
plan    → reuse if progress.plan.done && scene_plan.json validates && hash matches
build   → reuse finished components; only build the ones marked todo or failing
review  → skip if done and nothing upstream changed
sound   → skip files already generated
```

### 3.3 Make "Building the scenes" checkpointable

Split phase 2 into smaller Claude steps, each with a clear output the worker can check right away:

1. **Manifest first.** Claude writes `plan/build_manifest.json` before any code: which components exist (kit, each character, each place), and which component and props each shot will use. That is today's `shots.json` with a `status` field. The worker turns it into `progress.build.components`.
2. **One component per step,** in order: kit → characters → places. After each one, the worker compiles it and marks it `done` or `failed` in `progress.json`.
   - Do this either as separate Claude calls, or as one session with an instruction to stop after each component and wait.
3. **The final `shots.json`** is created by the worker from the manifest. Claude no longer has to write it last.

A Stop or failure now loses at most one component, and a compile error triggers a fix for that single file instead of a full restart.

### 3.4 Keep and resume Claude's own session

The installed Claude Code supports what's needed (checked with `claude --help`, v2.1.x):

- `--session-id <uuid>`: start a session with an ID we choose.
- `--resume <id>`: continue that session.
- `--fork-session`: when resuming, continue in a new session ID.

**Changes in `claude-code-agent.ts`:**
- Remove `--no-session-persistence` for generation runs. Keep it for small one-off calls if wanted.
- Accept `sessionId` and `resume: boolean` options. Pass `--session-id <uuid>` for a new session, or `--resume <uuid>` to continue one.
- Read `session_id` from the stream-json `system/init` event and return it, then store it in `progress.json`.

**On resume:**
- Continue the phase's own session with a short prompt: *"You were interrupted. Files already finished: … Continue with: …"*.
- If resuming fails (session expired or deleted, or the CLI was updated), fall back to a **fresh session** with a compact summary of the finished work. Never fail the job only because resume isn't possible.

**Cost note:** a resumed session re-sends its history, but prompt caching makes that much cheaper than re-reading every file and re-planning. A fresh session with a short summary is the cheap fallback.

### 3.5 UI and queue

- **Start animating** checks `plan/progress.json` first. If there is unfinished work, the button reads **"Continue animating"**, with a line such as *"Picks up at Building the scenes: 5 of 8 places done"*. A small **"Start over"** link next to it clears `plan/` and runs from the beginning (with confirmation).
- The progress panel opens with finished phases already ticked, and shows the component count during building.
- **Retry** in the Tasks menu uses the same resume path.
- After **Stop**, the toast says *"Stopped. Your progress is saved; press Continue animating to pick up where it left off."* instead of implying everything was lost.

### 3.6 Make failures less likely to restart anything

- **Never** treat a lost heartbeat or stale job as "start over". It should be a resumable failure. The 20-second heartbeat timer added in `apps/worker/src/index.ts` already fixed the false "stopped unexpectedly".
- When the worker restarts (`tsx watch` reload, or the app being closed), a job that was `running` should come back as **resumable** rather than failed.
- For very long stories, plan in **sections**: for example, plan each roughly 60-second part of the subtitles in its own step and checkpoint after each. One failure then never re-plans the whole story.

---

## 4. Implementation checklist

1. **`packages/providers/src/claude-code-agent.ts`**
   - Add `sessionId?`, `resume?` and `persistSession?` options.
   - Capture `session_id` from the init event.
   - Return `{ summary, costUsd, turns, sessionId }`.
2. **New `apps/worker/src/jobs/generate-progress.ts`**
   - Read, write and validate `plan/progress.json`.
   - Hash helpers.
   - Invalidation rules.
3. **`apps/worker/src/jobs/generate.ts`**
   - Per-phase reuse (3.2).
   - Manifest-first, per-component build (3.3).
   - Record the session ID per phase and resume it (3.4).
   - Record finished sound files (3.1).
4. **`packages/database/src/jobs-catalog.ts`**
   - Add `mode: "continue" | "restart"` to the `agent.generate` input (default `continue`).
5. **`apps/web/src/components/editor/start-animating.tsx`**
   - "Continue animating" / "Start over".
   - Ticked phases and the component count.
6. **New `GET /api/projects/[id]/generation`**
   - Returns a summary of `plan/progress.json` for the button text.
7. **Skills**
   - Update the build prompt so components are written one at a time against the manifest.

## 5. How to test

| Scenario | Expected |
|---|---|
| Stop during phase 1, then Continue | Phase 1 runs again (nothing usable was saved). |
| Stop during phase 2 after 3 of 8 components, then Continue | Plan reused; only 5 components built; the session is resumed (check the logs for `--resume`). |
| One component fails to compile at the end of phase 2 | Only that component is fixed; nothing else is rebuilt. |
| Kill the worker during phase 2, restart, then Continue | Same as Stop: resumes. |
| The Claude session ID no longer exists | Falls back to a fresh session with a summary; the job still succeeds. |
| Edit `input/subtitles.json`, then Continue | The plan is invalidated, and everything runs again from phase 1. |
| Edit one scene file by hand, then Continue | That component is kept; only review and sound run again. |
| Fail during sound after 10 of 20 sound effects | Retry makes only the remaining 10 (no double ElevenLabs charge). |
| "Start over" | `plan/` is cleared and a full run starts. |
