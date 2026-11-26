# Documentary Studio — Architecture

## Overview

```
 Browser (Next.js app, apps/web)
 ┌───────────────────────────────────────────────────────────────┐
 │ Script │ Media │ Clip   │  Preview (Remotion Player)  │  AI    │
 │ panels                  │                             │ Assist │
 │─────────────────────────┴─────────────────────────────┴────────│
 │ Multitrack timeline (custom React; pure ops from @studio/timeline)
 └───────────────▲───────────────────────────────▲────────────────┘
                 │ Route Handlers (JSON, uploads,│ polling /status
                 │ media with HTTP Range)        │
            ┌────┴───────────────────────────────┴────┐
            │                MongoDB                   │
            │ projects · timelines (+snapshots) ·      │
            │ scripts · mediaassets · generationjobs · │
            │ chatmessages · providersettings          │
            └────▲─────────────────────────────────────┘
                 │ claims jobs atomically
 ┌───────────────┴──────────────────────────────────────────────┐
 │ Worker (apps/worker)                                          │
 │ media.process  story.write  voice.generate  subtitles.generate│
 │ storyboard.plan  images.generate  render  assistant.turn      │
 │   ↳ providers: Claude / GPT · VoiceStudio / ElevenLabs ·      │
 │     Whisper (local) / OpenAI Whisper · OpenAI Images          │
 │   ↳ FFmpeg (probe, waveform, thumbnails, filmstrips, concat)  │
 │   ↳ Remotion (bundle + renderMedia, loopback media server)    │
 └──────────────────────────────────────────────────────────────┘
        Media files: ./storage (storage adapter; keys only in DB)
```

## Packages

| Package | Responsibility |
|---|---|
| `packages/timeline` | **The synchronized timeline.** Zod schema (tracks, clips, markers), pure editing ops (add/move/trim/split/delete/duplicate, tracks, markers, snapping, insert time), script schema, narration/subtitle/visual layout, subtitle cue building, render readiness checks. Shared by UI, agents and renderer. Fully unit-tested. |
| `packages/renderer` | Remotion composition (`Documentary`) — composes images (Ken Burns motion), video, audio (volume + fades), transitions and Bangla subtitles/titles (Noto Sans Bengali). The same component drives the in-browser preview and server rendering (`render.ts`). It composes existing media; it does not create footage. |
| `packages/providers` | Provider adapters behind capability interfaces: `TextBrain` (Claude via the official Anthropic SDK; GPT via the OpenAI Responses API), `SpeechEngine` (VoiceStudio, ElevenLabs), `Transcriber` (local openai-whisper CLI, OpenAI whisper-1), `ImageGenerator` (OpenAI Images). Registry picks what the user connected; connection tests. |
| `packages/database` | Mongoose models and repositories; optimistic concurrency (revisions) for timeline and script; persistent job queue (atomic claim, heartbeats, retry with back-off, cancel, stale recovery); AES-256-GCM encrypted API keys. |
| `packages/media` | Storage adapter (local disk, path-traversal-safe keys, atomic writes), ffprobe, FFmpeg helpers. |
| `apps/worker` | Job handlers and the assistant's tools. |
| `apps/web` | Next.js 16 App Router UI + Route Handlers. |

## Key decisions

- **One timeline, seconds everywhere.** Frames exist only inside Remotion
  (`Math.round(seconds * fps)`). Audio and video share the same timeline;
  narration clips carry `sceneId`, and scene markers come from the narration
  layout, so visual planning is timed to the *real* voice duration.
- **Audio first.** Voice → subtitles → visual plan. “Lock audio” makes audio
  tracks read-only (with a restorable snapshot) while visuals are fitted.
- **Agents act through tools, not text.** The assistant runs a tool loop
  (write/update/add scene, generate voice/subtitles/visuals/images, place
  media, edit clips, extend scene, add titles, render). Slow actions become
  background jobs; it never claims unfinished work is done.
- **Optimistic concurrency.** The editor autosaves with a base revision; if
  the assistant or a job changed the timeline meanwhile, the user chooses to
  load the latest or keep their version. Agents use read-modify-write with
  retries.
- **Real progress only.** Progress comes from the worker (per scene, per
  picture, Remotion frame progress). Failures keep successful work and show a
  plain-language reason with Retry.
- **No fake generation.** Missing providers produce a clear “connect X in
  Settings” error and the UI always offers upload instead.

## Integrations (verified against official docs, Nov 2026)

| Service | Endpoint / model | Notes |
|---|---|---|
| Claude | Anthropic SDK, `claude-opus-5-5`, adaptive thinking, structured JSON output, tool use, server-side refusal fallback | Model configurable in Settings |
| GPT | `POST /v1/responses`, default `gpt-6.2-astra`; JSON schema output; function calling | Model configurable |
| OpenAI Images | `POST /v1/images/generations`, default `gpt-image-2.5-flare` | Sizes 1536×1024 / 1024×1536 / 1024×1024 |
| VoiceStudio | `POST http://127.0.0.1:3900/v1/audio/speech` with `language: "bn"`; voices `GET /v1/audio/voices` | Local app; for natural Bangla use a voice profile cloned from Bangla audio |
| ElevenLabs | `POST /v1/text-to-speech/{voice}` with `eleven_v4` (Bengali supported), `language_code: "bn"` | `eleven_multilingual_v2` does **not** support Bengali |
| Whisper (local) | `whisper <file> --language bn --word_timestamps True --output_format json` | `medium` default; CPU only |
| OpenAI Whisper | `POST /v1/audio/transcriptions`, `whisper-1`, `verbose_json` + word timestamps | OpenAI shutdown date 2027‑02‑26; 25 MB limit |
| OpenAI TTS | not used | Bengali not supported; endpoint retiring 2027‑01‑06 |

## Known limits / next steps

- No music generator is connected (upload music; ElevenLabs sound effects
  could be added for SFX).
- Standalone MongoDB has no multi-document transactions; multi-step writes use
  compensation and revision checks. A single-node replica set would allow
  transactions.
- Remotion is free for individuals and small companies; larger companies need
  a Remotion company licence.
- Single-user, local app — no authentication. Don’t expose it beyond
  localhost.
- Rendering is memory-hungry; the worker runs one render at a time
  (concurrency 2 inside Remotion).
