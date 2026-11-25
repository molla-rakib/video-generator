# StoryMotion: Documentary Video Generator — Product & Build Plan

> Working name. **Main goal: anyone can make a real, well-researched documentary video** by describing the topic or story.
> Exported in **16:9, 9:16, 1:1 and 4:5**. Built on **Next.js 16 + Claude API + Remotion**.

## ⚡ Direction update (Nov 2026): 2D cartoon animation first

The visual engine is now **2D cartoon animation rendered by Remotion**, not photo slideshows. Claude writes an animation plan (cast, actions, props, backgrounds, camera, speech bubbles, counters, timelines); Remotion draws and animates every frame. Research, fact-checking and sources stay. Real photos remain an optional extra (section 8), not the default.

**Built so far**
- Animation engine (`remotion/anim/`): rigged characters (8 outfits, 8 hair styles, hats, expressions, blinking, lip movement, walk/run/wave/point/talk/cheer/think/jump/dance…), 23 animated props, 13 backgrounds × day/sunset/night with parallax, camera moves, particle effects, speech/thought bubbles, titles, counters, timelines, 4 art styles (flat, storybook, bold, retro).
- AI director (`lib/ai/director.ts`, `/api/generate`): prompt → full animated video via Claude (web-search research, tool-based output, Zod validation + automatic repair), plus "edit with AI".
- UI: Create screen (story box + style/format/length/fact-check presets, examples gallery) and Studio (player, ratio switch, scene strip, Edit with AI, script with fact badges, sources, instant style switch, undo, MP4 export in 4 ratios × 720p–4K via Remotion's renderer).

**Next**: narration voice (TTS) + music, more characters/props/backgrounds, accounts + database (projects are in localStorage today), Remotion Lambda for cloud export.

The sections below are the original plan; where they describe photo-first visuals, read "animated scenes" instead.

---

## 1. Vision

A user types: *"A 5-minute documentary about the rise and fall of the Silk Road"*, or pastes their own script or research notes.

The system then:
1. **Researches** the topic on the web and collects facts **with sources**
2. Writes a documentary **script** with chapters and narration
3. Finds **real media** (archival photos, public-domain images, stock footage, maps) and builds animated graphics (timelines, maps, charts)
4. **Fact-checks** the script against sources
5. Assembles a narrated, captioned, music-scored documentary
6. Exports it for YouTube (16:9), Shorts/Reels/TikTok (9:16), Instagram feed (4:5 and 1:1), all from one project

**Design principles**
- **Zero required decisions.** Every setting defaults to **Auto**.
- **Truth first.** Every factual claim is traceable to a source the user can see.
- **Real media first; AI imagery is labelled.** AI imagery is used only for reconstructions and illustrations, and is always marked as such.
- **One project, every format.** Aspect ratio is an export choice, not a rebuild.

**Who it's for**
1. YouTube documentary and essay creators (history, science, true crime, business stories)
2. Educators and students (history lessons, science explainers)
3. Journalists, NGOs, local historians (short-form docs for social)
4. Brands (company history, impact stories, founder stories)

---

## 2. "Connect Claude": how users get AI access

A personal **Claude.ai Pro/Max subscription cannot power another website**. Third-party apps use the **Claude API** (API keys).

| Option | User experience | Recommendation |
|---|---|---|
| **A. Platform-managed** (we hold the API key, user buys a plan/credits) | User connects *nothing*. Sign up → describe topic → documentary. | ✅ **Default** |
| **B. Bring Your Own Key** (user pastes their Anthropic API key) | One extra step in Settings → Advanced | Phase 2 option for power users/agencies. Key encrypted, never sent to browser. |

---

## 3. Core architecture

```
 Topic / story / script / own media
          │
          ▼
 ┌──────────────────────────────────────────────┐
 │  AI Pipeline (Claude + web search/fetch)     │
 │  Intake → Research → Script → Fact-check     │
 │  → Visual Director → Media Researcher        │
 │  → Motion Editor → QA Critic (vision)        │
 └───────────────────┬──────────────────────────┘
                     ▼
     DocSpec (JSON) + Source Ledger + Media Ledger
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
  Remotion Player          Render Worker (Remotion Lambda)
  (live preview,           → MP4 / WebM in 16:9 · 9:16 · 1:1 · 4:5
   low-res proxies)          up to 4K, + SRT captions + sources list
```

**Key decision:** Claude never writes code. It outputs a **DocSpec (validated JSON)**, which a fixed library of documentary-grade Remotion components plays back. That gives us reliability, chat editing, and correct layouts in every aspect ratio.

Three ledgers travel with every project:
- **Source Ledger:** every fact → URL, title, publisher, date, quote excerpt
- **Media Ledger:** every image/clip → origin, license, author, attribution text, AI-generated yes/no
- **Spec versions:** full history for undo and audit

### 3.1 DocSpec (simplified)

```jsonc
{
  "version": 1,
  "meta": { "title": "The Silk Road", "language": "en", "targetDurationSec": 300, "fps": 30 },
  "style": { "preset": "history-classic", "grade": "warm-archival", "font": "Cormorant Garamond", "lowerThird": "serif-line" },
  "voice": { "id": "deep-narrator-1", "pace": "measured" },
  "music": { "mood": "epic-ancient", "duckUnderVoice": true },
  "chapters": [
    {
      "id": "ch1",
      "title": "A Road of Silk and Steel",
      "scenes": [
        {
          "id": "s1",
          "narration": "In 138 BC, a Chinese envoy named Zhang Qian set out west on a mission that would change the world.",
          "claims": [{ "text": "Zhang Qian set out in 138 BC", "sourceIds": ["src3", "src7"], "status": "verified" }],
          "visual": {
            "type": "photo",
            "mediaId": "m12",
            "motion": { "kind": "ken-burns", "from": "wide", "to": "face-focus" },
            "focusPoint": { "x": 0.62, "y": 0.35 }
          },
          "overlays": [
            { "type": "lower-third", "title": "Zhang Qian", "subtitle": "Han dynasty envoy · c. 164–113 BC" },
            { "type": "date-stamp", "text": "138 BC" }
          ],
          "caption": { "style": "documentary-clean" },
          "transition": { "type": "dissolve", "durationSec": 0.8 }
        },
        {
          "id": "s2",
          "narration": "His route stretched over 6,000 kilometres, from Chang'an to the Mediterranean.",
          "visual": {
            "type": "map",
            "region": "eurasia",
            "route": [{ "place": "Xi'an" }, { "place": "Samarkand" }, { "place": "Antioch" }],
            "animation": "draw-route",
            "labels": true
          }
        }
      ]
    }
  ],
  "endCard": { "showSources": true, "showMediaCredits": true }
}
```

Scene `visual.type` options: `photo`, `video-clip`, `map`, `timeline`, `chart`, `document` (newspaper/letter with highlight), `quote-card`, `split-compare`, `illustration` (AI, labelled), `title-card`, `user-media`.

---

## 4. The AI pipeline: "skills" under the hood

All calls use **`claude-opus-5-5`** with adaptive thinking, with effort tuned per stage. Structured stages use **structured outputs** so the JSON always matches our schemas. Research uses Claude's **web search and web fetch server tools**. Visual checks use **Claude vision**. Refusals (`stop_reason: "refusal"`) are handled with server-side fallbacks and a friendly message.

| # | Stage | What it does | Effort |
|---|---|---|---|
| 0 | **Intake** | Topic/story/script + presets → brief: subject, angle, audience, length, tone, doc genre. Asks **at most 1 question**, only if truly ambiguous. | low |
| 1 | **Researcher** | Web search + fetch → **Research Dossier**: key facts, dates, people, places, numbers, competing viewpoints, each with sources. Prefers primary/reputable sources. | high |
| 2 | **Scriptwriter** | Dossier → chapters, narrative arc (hook → context → conflict → turning point → resolution), narration lines tagged with claim IDs | high |
| 3 | **Fact-checker** | Re-checks every claim against its sources → `verified` / `disputed` / `unsupported`. Rewrites or flags weak claims. Disputed facts are phrased carefully ("historians disagree…"). | high |
| 4 | **Visual Director** | For each line, decides what the viewer sees: archival photo, map, timeline, chart, clip, quote card… plus overlays (lower-thirds, dates, place names) | medium |
| 5 | **Media Researcher** | Searches licensed sources (§8) for each scene, then uses **vision to score candidates** for relevance, quality and era-accuracy. Picks the best image, keeps 3 alternatives, sets focus points for Ken Burns. Falls back to labelled AI illustration only when nothing real fits. | medium |
| 6 | **Motion Editor** | Timing against narration audio, camera moves, transitions, music cues → final DocSpec | medium |
| 7 | **QA Critic** (vision) | Renders still frames per scene **in each chosen ratio (16:9, 9:16, 1:1, 4:5)** → checks text overlap, faces cut off, unreadable captions, wrong-era images, repetition → fixes | medium |
| 8 | **Editor** (chat) | User message + spec → minimal JSON Patch ("use a different photo here", "shorten chapter 2", "add a map of Rome") | low/medium |

**The QA Critic (stage 7) means the system checks every frame before the user sees it**, in every aspect ratio.

### 4.1 Skill packs (versioned in repo)

```
/skills
  /core          documentary-storytelling.md, narration-voice.md, pacing.md,
                 sourcing-standards.md, fact-checking.md, ethics.md,
                 typography.md, layout-safe-zones.md (16:9 / 9:16 / 1:1 / 4:5)
  /genres        history.md, biography.md, nature.md, science.md, true-crime.md,
                 business-story.md, travel-culture.md, investigative.md, short-doc-social.md
  /styles        history-classic.md, modern-clean.md, netflix-dark.md, archival-film.md,
                 nature-cinematic.md, newsroom.md, minimal-explainer.md
  /platforms     youtube-longform.md, shorts-reels-tiktok.md, instagram-feed-4x5.md, linkedin.md
  /catalog.json  auto-generated list of components, overlays, map regions, styles the AI may use
```

- Presets choose which skill files are loaded (prompt-cached, so cheap after the first call).
- The AI can only use components in `catalog.json`, so it never invents a missing component.
- Each genre has an **eval set** of sample topics with scoring for accuracy, pacing, visual match and source quality.

---

## 5. Presets: what users pick (all optional, default Auto)

| Preset | Choices | Default |
|---|---|---|
| **Documentary type** | History, Biography, Nature, Science, True crime, Business/company story, Travel & culture, Investigative, Short doc (social) | Auto-detect |
| **Visual style** | History Classic, Modern Clean, Dark Cinematic, Archival Film (grain/sepia), Nature Cinematic, Newsroom, Minimal Explainer | Auto from genre |
| **Aspect ratio** | **16:9**, **9:16**, **1:1**, **4:5**, or "All formats" | 16:9 |
| **Length** | 60s, 3 min, 5 min, 10 min, 20 min, Auto | Auto |
| **Narrator voice** | ~12 curated documentary voices (deep/warm/neutral, male/female, accents), or "no narration (text-led)" | Matched to genre |
| **Music** | Epic, Somber, Mysterious, Hopeful, Tension, Ambient, None | Auto |
| **Captions** | Documentary clean, Bold social (word highlight), None | Clean (16:9), Bold (9:16 / 4:5) |
| **Sources on screen** | End credits only / small on-screen citations / both | End credits |
| **Media policy** | Real media only / Real + labelled AI illustrations | Real + labelled AI |
| **Research depth** | Quick / Standard / Deep | Standard |
| **Language** | 20+ languages | Detected |
| **Brand kit** *(Pro)* | Logo, colors, fonts, intro/outro | Off |

Presets show as friendly chips under the input box with thumbnail/preview pickers, never plain dropdowns.

---

## 6. Aspect ratios: all four are first-class

| Ratio | Size @1080 | Use | Layout notes |
|---|---|---|---|
| **16:9** | 1920×1080 | YouTube, websites, TV | Classic doc layout: lower-thirds bottom-left, captions bottom-center |
| **9:16** | 1080×1920 | Shorts, Reels, TikTok | Media centered/cropped on focus point; big captions in the middle-lower third; avoid platform UI zones (top 12%, bottom 20%, right edge) |
| **1:1** | 1080×1080 | Feed posts, LinkedIn | Tighter crops; overlays stacked |
| **4:5** | 1080×1350 | Instagram/Facebook feed (most screen space in feed) | Top title band + media + caption band; lower-thirds move above captions |

How it works:
- Every overlay uses **anchors + safe zones per ratio**, never fixed pixels (`useLayout(ratio)`).
- Every image/clip has a **focus point** (picked by the Media Researcher with vision), so crops keep the subject in frame in every ratio. It can be overridden by dragging in the editor.
- Maps and timelines have **ratio-specific layouts** (horizontal timeline in 16:9, vertical in 9:16/4:5).
- **Ratio toggle in the editor** previews all four instantly. The QA Critic checks all chosen ratios.
- **Export all formats in one click**, rendered in parallel.
- Resolutions: 720p, 1080p, 1440p, 4K for each ratio (e.g. 4:5 4K = 2160×2700).

---

## 7. UX: screen by screen

### 7.1 Create
- Large input: **"What's your documentary about?"**. Accepts a topic, a story, a full script, or pasted research notes/links.
- 🎙 Voice input · 📎 Attach your own photos/videos/documents/PDFs (Claude reads them as sources/media)
- Preset chips (§5), example topics ("The 1906 San Francisco earthquake", "How Lagos became Africa's largest city"…)
- **Create documentary**

### 7.2 Research review (optional, skippable, one screen)
- "Here's what I found": key facts as cards, each with source chips (favicon + publisher)
- User can ✓ keep, ✗ remove, or ✎ add a fact/source
- Users can also skip this and let it run on Auto
- Shows warnings: "2 claims are disputed between sources"

### 7.3 Generating (live, never a blank spinner)
1. 🔎 Researching… (sources appear as they're found)
2. ✍️ Writing script… (chapters stream in)
3. ✅ Fact-checking…
4. 🖼 Finding images & footage… (scene cards fill with real thumbnails)
5. 🎬 Animating & narrating…
6. 🔍 Final check (all formats)…
7. **Ready**: auto-plays

Targets: first scene card < 15s; 3-min doc playable < 2–3 min; longer docs stream chapter by chapter, so chapter 1 is playable while later chapters finish.

### 7.4 Editor
```
┌──────────────────────────────────────────────┬──────────────────┐
│                                              │ Tabs:            │
│      ▶ Preview  [16:9][9:16][1:1][4:5]       │ 💬 Chat          │
│                                              │ 📚 Sources       │
│                                              │ 🖼 Media         │
├──────────────────────────────────────────────┤ 📝 Script        │
│ Ch1 ▸ [s1][s2][s3]  Ch2 ▸ [s4][s5] ...       │                  │
│ ── narration waveform ── music ── captions ──│                  │
└──────────────────────────────────────────────┴──────────────────┘
```
- **Chat edits:** "swap this photo for one of the actual ship", "add a map showing the route", "make chapter 3 more dramatic"
- **Script tab:** edit narration like a document. Voice and timing regenerate for that line only. Each line shows its source badges and fact-check status.
- **Media tab:** for the selected scene: alternatives, search, upload your own, drag the focus point, see license/credit
- **Sources tab:** full source list, add/remove, re-check
- Per-scene: regenerate visual, change motion (Ken Burns direction), change overlay
- Undo/redo + version history, autosave
- Mobile: preview + chat + script only

### 7.5 Export
- Pick ratios (any combination of **16:9 / 9:16 / 1:1 / 4:5**), resolution (720p–4K), format (MP4, WebM), fps (24 / 25 / 30)
- Extras: SRT/VTT captions, **sources & credits PDF**, YouTube description with chapters + timestamps + citations, thumbnail images per ratio
- **Shorts cut:** auto-generate a 30–60s 9:16 or 4:5 teaser from the long doc
- Progress + notification when done

---

## 8. Media sourcing & licensing (new core system)

Real documentaries need real media. Each item is stored in the **Media Ledger** with license + attribution.

| Source | Content | License notes |
|---|---|---|
| **Wikimedia Commons** | Historical photos, paintings, maps, documents | Mixed (PD, CC-BY, CC-BY-SA). Store each item's license and attribution, and skip non-free licenses. |
| **Library of Congress, Smithsonian Open Access, NASA, NOAA, Europeana, national archives** | Archival photos, documents, space/nature | Mostly public domain / CC0. Verify each item. |
| **Pexels / Pixabay APIs** | Modern stock photos & video clips | Free licenses. Store attribution anyway. |
| **Paid stock APIs** (e.g. Storyblocks, Shutterstock): Phase 3 | Premium footage | Per-plan licensing cost |
| **User uploads** | Their own footage, interviews, photos, PDFs | User confirms rights on upload |
| **AI illustrations**: fallback | Reconstructions of scenes with no photos (ancient events etc.) | **Always labelled "Illustration"** on screen. Never photorealistic images of real people. |

- **Vision scoring:** Claude checks each candidate for subject match, era accuracy, quality, watermarks and text in the image.
- **No unlicensed scraping:** we only use sources with clear licenses via their APIs.
- Auto-generated **credits end card** + downloadable credits file.
- Previews use **low-res proxies**. Renders use full-resolution originals.

---

## 9. Remotion documentary component library

| Category | MVP | Later |
|---|---|---|
| **Photo motion** | Ken Burns (pan/zoom to focus point), slow push, 2.5D parallax (subject separated from background) | Depth-map parallax, photo colorize/restore filters |
| **Video** | Clip player with trim, speed, color grade (`OffthreadVideo`) | Picture-in-picture, slow-mo |
| **Maps** | World/continent maps (D3-geo + Natural Earth, public domain), animated route drawing, pins, region highlight, zoom to place | Historical borders by era, 3D globe spin |
| **Timelines** | Horizontal/vertical animated timelines with events and photos | Era bands, parallel timelines |
| **Charts** | Animated bar/line/counter ("6,000 km", "3 million people") | Pie, area, comparison |
| **Documents** | Newspaper/letter/page with highlight + zoom on a line | Handwriting reveal, redaction effect |
| **Overlays** | Lower-thirds (name/title), location stamp, date stamp, chapter titles, quote cards, "Illustration" label, on-screen citation | Brand kit variants |
| **Comparison** | Split screen, before/after slider | Then-and-now morph |
| **Looks** | Film grain, vignette, sepia/B&W, light leaks, letterbox | LUT-based grades |
| **Transitions** | Dissolve, fade-to-black, film burn, whip pan, map zoom transition | Match-cuts |
| **Animated 2D** | Icon/illustration scenes for concepts (from earlier plan) | Character explainers |

Every component reads from the **style theme** (fonts, colors, grade, overlay design) and the **layout engine** (ratio-aware anchors, safe zones, focus-point cropping).

---

## 10. Audio

- **Narration:** high-quality TTS with documentary voices + **word-level timestamps** (captions sync, scene timing follows the voice). Line-level regeneration. Option to **record or upload your own voice**.
- **Music:** royalty-free library tagged by mood/tempo/era, with chapter-level cues and auto-ducking under narration.
- **Ambience & SFX:** wind, crowds, sea, city, typewriter, camera shutter. Attached automatically based on the scene.
- **No cloning of real people's voices** without verified consent.

---

## 11. Rendering & export

- **Preview:** `@remotion/player` in browser with low-res proxies; chapters load lazily for long docs.
- **Final render:** **Remotion Lambda** (`renderMediaOnLambda`) splits long videos into parallel chunks, so a 20-min doc renders in minutes. One job per ratio, run in parallel.
- **QA stills:** `renderStill` per scene per ratio for the vision check.
- **Storage:** Cloudflare R2 / S3, signed URLs.
- ⚠️ **Remotion license:** free for individuals and companies with up to 3 people. A commercial product beyond that needs a **Remotion company license**.

---

## 12. Tech stack

| Layer | Choice |
|---|---|
| App | **Next.js 16** (App Router, already set up), React 19, TypeScript |
| UI | Tailwind v4 (already set up), shadcn/ui, Framer Motion |
| State | Zustand + TanStack Query |
| Schemas | Zod: DocSpec, Source Ledger, Media Ledger (shared by AI, UI, renderer) |
| AI | `@anthropic-ai/sdk`, `claude-opus-5-5`, adaptive thinking, structured outputs, streaming, prompt caching, web search + web fetch tools, vision, refusal fallbacks |
| Video | `remotion`, `@remotion/player`, `@remotion/lambda`, `@remotion/transitions`, `@remotion/google-fonts`, `@remotion/media-utils`, d3-geo |
| Media APIs | Wikimedia Commons, Library of Congress, Smithsonian, NASA, Pexels, Pixabay |
| Database | Postgres (Neon/Supabase) + Drizzle ORM |
| Auth | Better Auth or Clerk |
| Jobs | Inngest (multi-step, resumable pipeline: good fit for research → script → media → render) |
| Storage | Cloudflare R2 / S3 |
| Payments | Stripe |
| Realtime | Server-Sent Events |
| Monitoring | Sentry + PostHog |

### 12.1 Data model
- `users`: plan, credits, BYOK key (encrypted)
- `projects`: title, owner, current spec version, ratios, thumbnail
- `spec_versions`: DocSpec JSON, author (user/ai), triggering message
- `sources`: project_id, url, title, publisher, date, excerpt, reliability score
- `claims`: scene_id, text, source_ids, status (verified/disputed/unsupported)
- `media_items`: origin, original URL, license, author, attribution, ai_generated, focus point, proxy URL, full URL
- `chat_messages`, `render_jobs` (ratio, resolution, format, status, url), `credit_ledger`

### 12.2 Folders
```
app/
  (marketing)/page.tsx
  (app)/create/page.tsx
  (app)/project/[id]/page.tsx
  api/generate/route.ts      SSE pipeline progress
  api/edit/route.ts          chat edits
  api/media/search/route.ts  media alternatives
  api/render/route.ts        export
lib/
  ai/          stages (intake, research, script, factcheck, visual, media, motion, qa, editor), skill loader
  spec/        DocSpec schema, patches, validators
  media/       source adapters (wikimedia, loc, nasa, pexels…), licensing, proxies
  render/      lambda client, stills
remotion/
  Root.tsx              compositions for 16:9, 9:16, 1:1, 4:5
  DocFromSpec.tsx
  components/           photo, video, map, timeline, chart, document, overlays, looks, transitions
  themes/               style presets
  layout/               anchors, safe zones, focus-point cropping
skills/                 AI skill packs (§4.1)
```

---

## 13. Ethics, accuracy & safety (core to a documentary product)

- **Every factual line links to sources.** Unsupported claims are flagged and never silently kept.
- **Disputed facts** are shown to the user and phrased neutrally in narration.
- **AI imagery is always labelled** on screen. No photorealistic AI images of real people. No fake "archival" footage.
- **No deepfakes:** no face/voice synthesis of real people.
- **Defamation guard:** true-crime/investigative scripts about living people get extra fact-check strictness and a warning to the user.
- **Moderation** on inputs. Handle Claude refusals gracefully.
- **Licensing:** only licensed media, full credits generated automatically.
- **Transparency export:** sources + credits PDF with every video.

---

## 14. Cost & limits (rough)

- **Claude for a 5-min doc** (research with web search, script, fact-check, vision media scoring, QA): roughly **$2–5**. A 60s short doc is **under $1**. Prompt caching lowers repeat costs. Web search adds a small per-search fee.
- **Render:** cents per 1080p minute per ratio on Lambda.
- **TTS:** often the second-biggest cost. Depends on provider and length.
- **Controls:** credit cost scales with length and research depth. Per-plan max length. Every call logged in `credit_ledger`.

Suggested plans: **Free** (2 short docs/mo, 720p, watermark) · **Creator** (~$19/mo, up to 10-min docs, 1080p) · **Pro** (~$49/mo, 20-min docs, 4K, all-format batch export, brand kit) · **BYOK**.

---

## 15. Roadmap

### Phase 0: Foundations (week 1–2)
- [ ] Add Remotion, Player and Anthropic SDK to the Next.js app
- [ ] DocSpec + ledgers Zod schemas, 2 hand-written sample docs
- [ ] `DocFromSpec` with layout engine rendering correctly in **16:9, 9:16, 1:1, 4:5**
- [ ] Core components: Ken Burns photo, lower-third, date stamp, chapter title, captions, dissolve
- [ ] Auth, Postgres, projects

### Phase 1: MVP: "Topic → Documentary" (weeks 3–7)
- [ ] Create screen + preset chips
- [ ] Pipeline: Intake → Researcher (web search) → Scriptwriter → Fact-checker → Visual Director → Media Researcher (Wikimedia, LoC, NASA, Pexels) → Motion Editor
- [ ] Narration TTS with word timestamps + documentary captions + music library
- [ ] Components: maps with route drawing, timeline, counter/bar chart, quote card, archival look
- [ ] Editor: preview with 4-ratio toggle, chapters/scene strip, chat edits, script tab with source badges, media alternatives
- [ ] Export: MP4 1080p in **16:9 / 9:16 / 1:1 / 4:5**, credits end card, SRT
- [ ] Media + Source ledgers, auto credits
**Exit test:** a non-technical user makes a sourced 3-minute history documentary and exports it in 16:9 and 4:5 in under 10 minutes.

### Phase 2: Quality & trust (weeks 8–11)
- [ ] QA Critic vision pass across all ratios
- [ ] Research review screen, disputed-claim handling, sources PDF
- [ ] Focus-point editor, 2.5D parallax photos, video clips, document highlight component
- [ ] Upload own media/voice, PDF/notes as sources
- [ ] Shorts cut (auto teaser in 9:16 / 4:5)
- [ ] YouTube description + chapters export
- [ ] Stripe plans, BYOK

### Phase 3: Long-form & premium (weeks 12–16)
- [ ] 10–20 min docs with chapter-streamed generation
- [ ] Historical borders maps, 3D globe, more styles and voices
- [ ] Paid stock footage integration, 4K
- [ ] Multi-language versions of the same doc (re-narrate + re-caption)

### Phase 4: Pro & growth
- [ ] Brand kits, team workspaces, review/approval comments
- [ ] Public share pages, embed player
- [ ] Public API
- [ ] Interview mode: upload interview footage → auto-transcribe, pick soundbites, build doc around them

---

## 16. Success metrics

| Metric | Target |
|---|---|
| Claims with ≥1 reliable source | > 98% |
| User-reported factual errors per video | < 0.2 |
| Scenes with a real (non-AI) visual | > 85% |
| Time to first scene card | < 15s |
| 3-min doc playable | < 3 min |
| QA issues per video reaching user (all ratios) | < 1 |
| % generated videos exported | > 40% |
| Week-1 retention | > 30% |

---

## 17. Open decisions

1. **Product name & brand** (documentary-flavored).
2. **TTS provider:** voice quality for long narration, languages, word timestamps, price.
3. **Stock footage:** free sources only at launch (recommended), paid APIs from Phase 3.
4. **AI illustrations:** which image model, and default on or off (recommended: on, always labelled).
5. **Render infra:** Remotion Lambda first (recommended), own workers later for cost.
6. **Remotion company license** timing.
7. **Launch genre focus:** recommend **History + Biography** first (best free archival media, strong YouTube demand), then Science/Nature.
