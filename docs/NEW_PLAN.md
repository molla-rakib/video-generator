# AI Cartoon Video Studio: Product & Feature Specification

> **Working title:** AI Cartoon Video Studio (rename freely)
> **Type:** Local-first Next.js web app
> **Purpose:** Turn a voiceover (MP3/WAV) and its subtitle file (SRT/VTT) into a fully animated cartoon video with background music and sound effects, then let the user edit everything on a timeline and export it in any aspect ratio.

---

## 1. The Core Idea

The app has **no AI brain of its own**. It is an **orchestrator, editor, library and exporter**.

All creative work is done by an **external AI agent already installed on the user's PC**:

- **Claude Code** (Claude CLI / Claude Agent SDK), or
- **OpenAI Codex agent** (Codex CLI)

The user clicks **"Connect Claude"** or **"Connect GPT"**, uploads the audio and subtitles, picks a style, and the agent:

1. reads the subtitles,
2. understands the story, emotions and scenes,
3. writes the animation scenes as code,
4. generates the sound effects and background music,
5. checks its own work and fixes mistakes,
6. hands everything back to the app as **editable timeline data**.

The app then shows the result on a timeline, where the user can change anything and export.

**Key principle:** the video is stored as **data (a project JSON + scene components + media files)**, not as a baked MP4. Every edit is instant and does not need the AI again.

---

## 2. Responsibilities

### 2.1 What the App is responsible for

| Area | Responsibility |
|---|---|
| Input | Accept audio + SRT/VTT uploads, validate and parse them |
| Agent connection | Detect installed agents, launch jobs, stream progress, cancel/resume |
| Instructions | Provide the agent with style presets, skills and the job contract |
| Execution | Run agent-generated scene code safely (sandboxed) for preview and render |
| Timeline | Display and edit all tracks: scenes, voice, music, SFX, captions, overlays |
| Media | Media library with drag-and-drop for the user's own SFX, music and images |
| Asset database | Store every generated character, background, prop, sound and style for reuse |
| Preview | Live playback of the full video in the browser |
| Audio mixing | Apply volume, fades, mute/solo, and level rules in real time |
| Export | Render MP4 in 9:16, 16:9, 4:5, 1:1 at chosen resolution and loudness |
| QA | Automatic checks (frozen frames, black frames, loudness, missing files) |
| Settings | API keys (e.g. ElevenLabs), agent choice, folders, defaults |

### 2.2 What the AI Agent is responsible for

| Area | Responsibility |
|---|---|
| Story understanding | Read subtitles, understand the plot, characters, mood and emotional beats |
| Scene planning | Split the story into shots with timing taken directly from the SRT timestamps |
| Visual creation | Write scene code (Remotion/React components): characters, backgrounds, props, camera moves, effects |
| Asset reuse | Search the asset database first; reuse and extend existing assets before creating new ones |
| Sound design | Decide SFX cues and music mood; generate them via ElevenLabs API or code synthesis |
| Self-review | Render preview stills, look at them, fix visual problems before handing back |
| Output | Write results in the exact format the app expects (project JSON + files) |

### 2.3 What external services are responsible for

| Service | Responsibility |
|---|---|
| ElevenLabs Sound Effects API | Realistic SFX from text prompts ("train braking in heavy rain") |
| ElevenLabs Music API (optional) | Background music from a mood/genre prompt |
| Remotion | Rendering React-based scenes to video, live player for preview |
| FFmpeg | Audio analysis (silence detection, loudness), encoding, QA checks |

---

## 3. End-to-End User Workflow

1. **Open the app** → Home / Projects page.
2. **Create a new project** → give it a name.
3. **Choose a style preset** (e.g. "2D Bean-head Cartoon", "3D Toon World", "Storybook Watercolor").
4. **Upload files**:
   - main voiceover (`.mp3` / `.wav`)
   - subtitle file (`.srt` / `.vtt`)
5. **Choose options** (optional): target aspect ratio, captions on/off, music on/off, language.
6. **Click "Connect Claude" or "Connect GPT"** → the agent job starts.
7. **Watch progress** live: *Reading story → Planning scenes → Building scenes → Generating sounds → Checking frames → Done.*
8. **Review the contact sheet** of key frames (approve or ask for changes).
9. **The timeline opens** with every scene, voice, music and SFX clip in place.
10. **Edit freely**: volumes, timing, replace SFX, add own media, captions, etc.
11. **Optional AI revisions**: select a scene and type a request ("make it night", "add a cat") → the agent updates only that scene.
12. **Export** in one or more aspect ratios → MP4 files saved locally.
13. **Assets are saved** to the database automatically for future projects.

---

## 4. Feature Details

### 4.1 Project & Upload

- Upload voiceover: MP3, WAV, M4A (converted internally to WAV for analysis).
- Upload subtitles: SRT or VTT (both supported; VTT converted to the same internal format).
- **Subtitle parsing**:
  - Extract every cue: index, start time, end time, text.
  - Detect and strip **ElevenLabs audio tags** like `[happy]`, `[Dramatically]`, `[whispers]` that leak into subtitles. Store them as **emotion hints** for the agent instead of text.
  - Merge broken cues (e.g. a tag split across cues).
- **Audio analysis (no AI needed)**:
  - Duration, sample rate.
  - Silence detection to find real pauses and verify subtitle timing.
  - Loudness measurement of the voice (used later for level rules).
- **Validation warnings**:
  - Subtitle end time exceeds audio length.
  - Subtitles and audio appear out of sync.
  - Unsupported file type or empty file.
- Projects saved locally with auto-save.

### 4.2 Style Presets & Skills

- A **Style Library** where each style contains:
  - a skill/instruction file for the agent (rules, look, camera language, pacing),
  - color palette, line style, character design rules,
  - example frames for the agent to match,
  - default music mood and SFX approach,
  - linked assets (characters, backgrounds) already built in that style.
- User picks a style **before** generation.
- Users can create, duplicate and edit styles.
- Styles are versioned, so old projects keep working when a style changes.

### 4.3 Agent Connection

- **Auto-detect** installed agents on the PC (Claude Code CLI, Codex CLI) and show their status.
- **Connect button** per agent; remembers the last choice.
- **Headless execution**:
  - Claude Code: `claude -p` (print/headless mode) or the Claude Agent SDK.
  - Codex: `codex exec`.
- The app prepares a **job folder** with inputs and instructions, then launches the agent inside it.
- **Live progress streaming** from agent output into the UI (task list with steps).
- **Cancel**, **retry** and **resume** a job.
- **Per-scene re-generation**: send only one scene back to the agent with a change request.
- **Logs** saved per job for debugging.
- Agent works only inside the project folder (permission-limited).

### 4.4 Scene Planning (done by the agent)

- One shot per subtitle phrase by default; very short phrases merged.
- Timing taken **directly from SRT timestamps** (no speech recognition needed).
- Each shot defines: start/end frame, words covered, setting, lighting, camera move, characters, poses, expressions, effects, SFX cues.
- Shot sizes varied: close-up, wide, two-shot, insert, reaction.
- Emotional beats respected (e.g. twist line gets a "sting": music stops, flash, push-in).
- Every visual reaction lands on or just before its word.
- Output saved as `scene_plan.json` (see Section 6).

### 4.5 Visual Generation (done by the agent)

- Scenes written as **Remotion/React components**, so they run directly in the browser preview.
- Uses a **camera system** (pan, zoom, roll, shake, parallax layers, depth blur).
- Characters built as reusable components with parameters: pose, expression, blink, tears, walk, reach, ghost/glow effects, etc.
- Backgrounds built from layers (sky, clouds, hills, trees, buildings, ground) with painted textures.
- Effects: rain, ripples, dust, steam, light glows, flashes, fades, blackouts.
- **Reuse first**: the agent searches the asset database and reuses existing characters/backgrounds before drawing new ones.
- New assets are saved back with tags.
- **Multi-ratio aware**: each scene defines a safe area and camera framing per aspect ratio (see 4.11).

### 4.6 Generate → Check → Fix Loop

This is the most important quality feature.

1. Agent writes the scenes.
2. App (or agent) renders **preview stills** at the middle of each shot and at key actions.
3. A **contact sheet** image is created.
4. The agent **looks at the contact sheet** and fixes problems, for example:
   - character looks standing instead of sitting,
   - face hidden behind an object,
   - text mirrored or unreadable,
   - character cut off by frame edges,
   - scene too dark or too bright.
5. Repeat until it passes (with a max iteration limit).
6. The final contact sheet is shown to the user for approval before the full timeline opens.

### 4.7 Audio: Music & Sound Effects

- **SFX generation**:
  - Agent decides SFX cues from the story (rain, clock ticks, train, door, thunder, footsteps…).
  - Each cue generated via **ElevenLabs Sound Effects API** using a text prompt.
  - Fallback: code-synthesized SFX if no API key is set.
- **Background music**:
  - Mood chosen per story section (calm, eerie, emotional, tense).
  - Generated via ElevenLabs Music API or code synthesis, or picked from the user's library.
  - Music can stop or change on emotional beats (e.g. the twist).
- **Default level rules** (editable):
  - Music at 50 % of voice level (−6 dB, gated RMS).
  - SFX at 50 % or less of voice level.
  - SFX peaks capped at 70 % of the voice peak so no sound covers the narration.
  - The voice is never edited or re-timed.
- All sounds placed as separate clips on the timeline.

### 4.8 Timeline Editor

**Tracks**

| Track | Contents |
|---|---|
| Video / Scenes | One block per shot (thumbnail + name) |
| Voice | Main voiceover (locked by default) |
| Music | Background music clips |
| SFX | One clip per sound effect |
| Captions | Subtitle blocks (optional) |
| Overlays | User images, logos, text |

**Editing operations**

- Play / pause / scrub; frame-accurate playhead.
- Zoom timeline in/out; snap to subtitle cue boundaries.
- Drag clips to move; trim start/end; split; delete; duplicate.
- **Volume per clip** and **per track**; fade in / fade out.
- Mute / solo per track.
- **Replace a clip** (e.g. replace a generated SFX with the user's own file, keeping its position).
- Adjust scene start/end (scene animations re-time to fit).
- Change scene parameters exposed by the agent (e.g. light level, camera zoom, character expression) through a properties panel.
- Undo / redo with full history.
- Waveform display for audio clips.
- Keyboard shortcuts (space = play, S = split, Del = delete, Ctrl+Z = undo).

### 4.9 Media Library

- Drag and drop the user's own:
  - SFX (MP3/WAV),
  - music,
  - images (PNG/JPG/SVG),
  - video clips (optional, later).
- Drag from the library onto any timeline track.
- Shows generated assets from this project and the global asset database.
- Search, filter and tag media.
- Preview sounds and images before adding.

### 4.10 Asset Database (grows over time)

- Stores everything ever generated or uploaded:
  - characters (with all poses/expressions),
  - backgrounds and sets,
  - props and effects,
  - SFX and music,
  - styles and skills,
  - full scene components.
- Each asset has: name, type, style, tags, preview image, version, source project, date.
- The agent can **search** the database before creating anything new.
- Users can favorite, rename, edit tags, or delete assets.
- Over time, videos become faster, cheaper and more consistent.

### 4.11 Export

- **Aspect ratios**: 9:16 (Shorts/Reels/TikTok), 16:9 (YouTube), 4:5 (Instagram feed), 1:1.
- **Reframing**: because scenes are code (not flat video), each ratio is re-rendered with its own camera framing instead of cropping. Scenes define safe areas so characters stay in frame.
- **Resolution**: 720p, 1080p, 1440p, 4K.
- **Frame rate**: 24 / 30 / 60 fps.
- **Format**: MP4 (H.264 + AAC); optional MOV / WebM.
- **Loudness**: normalize to about −14 LUFS with a −1 dBFS peak limiter (social media standard).
- **Captions**: burn-in or export separate SRT/VTT.
- **Batch export**: several ratios in one click.
- **Stems export**: separate voice, music, SFX tracks for external editors.
- Export progress bar and render queue.

### 4.12 Captions (optional)

- Generated from the uploaded SRT (tags removed).
- Styles: font, size, color, outline, position, animation (word pop, fade).
- Full support for non-Latin scripts (e.g. Bangla) with proper fonts and text shaping.
- Editable text and timing on the Captions track.

### 4.13 Automatic QA Checks

Run before and after export:

- Frozen frames (no motion for ≥ 0.4 s) unless intentional.
- Black frames (unless intentional, e.g. ending blackout).
- Loudness and peak levels.
- Music/SFX not louder than the level rules.
- Missing or broken media files.
- Video and audio length match.
- QA report with a contact sheet and warnings.

### 4.14 Settings

- Agent selection and path (Claude Code / Codex).
- API keys: ElevenLabs (stored encrypted, locally).
- Default style, aspect ratio, resolution, level rules.
- Project and asset storage folders.
- Max agent iterations and cost/time limits.

### 4.15 Security & Safety

- Agent-generated code runs in a **sandbox** (iframe / web worker / isolated process) so broken or harmful code cannot affect the app or the PC.
- Agent restricted to the project folder.
- API keys never sent to the agent's output files or logs.
- Content rules in the skills: original characters only, no copyrighted characters or logos, no real people.

---

## 5. Folder Structure (per project)

```
projects/<project-id>/
├── input/
│   ├── voice.mp3
│   └── subtitles.srt
├── job/
│   ├── JOB.md              # instructions + contract for the agent
│   ├── style/              # copied style skill + example frames
│   └── logs/
├── plan/
│   └── scene_plan.json
├── scenes/                 # agent-written Remotion components
│   ├── Shot01_Clock.tsx
│   └── ...
├── assets/
│   ├── characters/
│   ├── backgrounds/
│   └── props/
├── audio/
│   ├── sfx/
│   └── music/
├── previews/
│   └── contact_sheet.jpg
├── project.json            # the timeline: single source of truth
└── exports/
```

---

## 6. Data Model (simplified)

### 6.1 `project.json`

```json
{
  "id": "midnight-train",
  "style": "2d-beanhead-v1",
  "fps": 30,
  "durationFrames": 1345,
  "ratios": ["9:16", "16:9", "4:5"],
  "tracks": {
    "scenes": [
      { "id": "s1", "component": "scenes/Shot01_Clock.tsx", "start": 0, "end": 100,
        "props": { "lightLevel": 1.0, "cameraZoom": 3.1 } }
    ],
    "voice": [{ "src": "input/voice.mp3", "start": 0, "volume": 1.0, "locked": true }],
    "music": [{ "src": "audio/music/bed.wav", "start": 0, "end": 962, "volume": 0.5,
                "fadeIn": 15, "fadeOut": 3 }],
    "sfx": [{ "id": "train_brake", "src": "audio/sfx/train_brake.mp3", "start": 318,
              "volume": 0.45, "prompt": "old train braking in rain" }],
    "captions": [],
    "overlays": []
  },
  "mix": { "musicVsVoiceDb": -6, "sfxVsVoiceDb": -6, "sfxPeakCap": 0.7, "targetLufs": -14 }
}
```

### 6.2 `scene_plan.json` (written by the agent)

```json
{
  "story": "An old man waits at an abandoned station at 2:17 AM...",
  "emotionHints": [{ "atSec": 33.5, "tag": "dramatic" }, { "atSec": 40.0, "tag": "happy" }],
  "shots": [
    { "id": "s3", "start": 270, "end": 360, "words": "হঠাৎ একটা ট্রেন এসে থামল",
      "setting": "station-trackside", "light": "night-rain",
      "camera": "wide, shake on stop at 338",
      "characters": [{ "id": "old-man", "pose": "sit", "expression": "head-down" }],
      "sfx": ["horn@276", "rumble@280", "brake@318", "hiss@339"] }
  ]
}
```

---

## 7. Agent Job Contract

The app writes `job/JOB.md` containing:

1. **Inputs**: paths to voice, subtitles, parsed cues, emotion hints, audio analysis.
2. **Style**: path to the chosen style skill and example frames.
3. **Asset database access**: how to search and reuse assets.
4. **Tasks**: plan → build scenes → generate audio → render previews → self-review → fix.
5. **Rules**: never edit the voice; timing from SRT; level rules; content rules.
6. **Output contract**: required files (`scene_plan.json`, `scenes/*.tsx`, `audio/*`, `project.json`, `previews/contact_sheet.jpg`).
7. **Progress format**: lines like `PROGRESS: building scene 4/11` so the app can show a live task list.

The app validates the output (schema check, files exist, preview renders) before opening the timeline. If validation fails, it sends the errors back to the agent automatically.

---

## 8. Suggested Tech Stack

| Layer | Technology |
|---|---|
| App framework | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Timeline | Custom React timeline (or a library such as `@xzdarcy/react-timeline-editor`) |
| Video engine | Remotion (`@remotion/player` for preview, `@remotion/renderer` for export) |
| 3D styles (optional) | three.js / `@remotion/three` |
| Audio | Web Audio API (preview mixing), FFmpeg (analysis, final mix, encoding) |
| Waveforms | wavesurfer.js |
| Database | SQLite (Prisma or Drizzle) for local; Postgres later for cloud |
| File storage | Local disk (later: S3-compatible) |
| Agent bridge | Node child processes (Claude Code CLI / Agent SDK, Codex CLI) |
| SFX / Music | ElevenLabs API |
| Subtitle parsing | `subtitle` / `srt-parser-2` or custom parser |

---

## 9. Out of Scope (for now)

- The app does **not** contain its own AI model or prompt logic beyond the job contract.
- No speech recognition (subtitles already provide words and timing).
- No voice generation inside the app (voiceover is made in ElevenLabs beforehand; could be added later).
- No cloud multi-user collaboration in v1.
- No direct publishing to social platforms in v1.

---

## 10. Roadmap

### MVP (v1)
- Upload audio + SRT, parsing, tag cleanup.
- One style preset.
- Connect Claude Code (headless) with job contract and progress.
- Scene plan + Remotion scenes + contact-sheet self-review loop.
- ElevenLabs SFX + simple music.
- Timeline: move, trim, volume, replace, mute.
- Export 9:16 and 16:9 at 1080p.

### v2
- Codex agent support.
- Multiple styles + style editor.
- Asset database with search and reuse.
- Per-scene AI revisions.
- Captions track with Bangla support.
- 4:5 and 1:1 export, batch export, stems export.
- QA report.

### v3
- 3D toon style preset.
- Scene property panel (edit lighting, camera, expressions without AI).
- Template stories and reusable sets.
- Optional cloud sync and team sharing.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Agent produces broken or ugly scenes | Generate → check → fix loop; output validation; retry |
| Results vary between runs | Detailed style skills, example frames, asset reuse |
| High API cost / long wait | Asset reuse, per-scene regeneration, iteration limits |
| Generated code is unsafe | Sandbox execution, folder-restricted agent |
| Different aspect ratios cut off characters | Per-ratio camera framing and safe areas in every scene |
| Sound covers the narration | Enforced level rules and peak caps, editable by user |
| Agent CLI updates break integration | Thin adapter layer per agent, version checks |

---

## 12. Summary

The app is the **studio**: it stores, shows, edits, mixes and exports.
The connected AI agent is the **artist and sound designer**: it understands the story and creates the scenes and sounds.
ElevenLabs is the **sound library**, Remotion is the **camera and renderer**, and the growing asset database makes every next video faster, cheaper and more consistent.
