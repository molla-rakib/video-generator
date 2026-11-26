# MASTER DEVELOPMENT PROMPT — DOCUMENTARY STUDIO

You are a Senior Full-Stack Architect, Product Designer, AI Integration Engineer, and Video Production Systems Engineer.

I want you to build a professional application called **Documentary Studio**.

This is not a generic AI dashboard. It is an AI-assisted documentary production workspace that helps ordinary people create professional documentary-style videos without needing advanced video editing or sound engineering knowledge.

The application should guide users through the entire production process, from a simple story idea to a finished documentary video.

Your responsibility is to design and implement a reliable, scalable, maintainable application with an exceptionally simple user experience.

Do not build a complicated interface just because the underlying technology is complex.

A normal person with no technical or video-editing experience should be able to understand and use this application.

---

# 1. PRODUCT VISION

Documentary Studio follows one central production principle:

**AUDIO FIRST → VIDEO SECOND → FINAL RENDER**

The application must manage the complete documentary production workflow:

1. User creates a documentary project.
2. AI develops the story and narration.
3. AI generates a structured master timeline.
4. Audio assets are generated individually.
5. User reviews and finalizes the audio.
6. The final audio is locked.
7. AI creates a visual storyboard based on the approved story and final audio.
8. User generates or uploads visual assets.
9. Remotion combines the visuals and final audio.
10. User previews and renders the final documentary.

The entire application must use a shared timeline system.

Never generate the final video independently and then attempt to fit the audio afterward.

The audio timeline is the source of truth for final video synchronization.

# 2. TECHNOLOGY STACK

Use the following technologies:

### Frontend

- Next.js with App Router
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Lucide icons

### Backend

- Next.js Route Handlers for application APIs
- Node.js background worker for long-running tasks
- MongoDB
- Mongoose or a well-structured MongoDB data access layer
- Zod for schema validation

### Video and Audio Processing

- Remotion for programmatic video composition and rendering
- FFmpeg for audio/video processing and media inspection
- Whisper for audio transcription and dialogue timestamps

### AI integrations

Design provider adapters for:

- Claude API for story development, script writing, structured timelines and storyboard generation.
- VoiceStudio for voice generation where its supported local integration is available.
- ElevenLabs for supported speech and sound-effect generation.
- A configurable music generation provider.
- Future image and video generation providers.

Important:

- Do not assume every provider has the same capabilities.
- Do not invent API endpoints or integrations.
- Read official documentation before implementing an integration.
- If an integration requires an API key, make it configurable through application settings or environment variables.
- Never expose API keys to the browser.
- Support manual media upload as a fallback for every generation workflow.

# 3. DESIGN SYSTEM AND UI/UX

This is extremely important.

The interface must be **WHITE THEMED**.

Use shadcn/ui as the primary component library.

### Visual direction

Build a clean, modern, minimal, premium-looking application.

Reference the usability of modern productivity applications rather than complicated professional video-editing software.

Design requirements:

- White background.
- Light gray secondary surfaces.
- Dark charcoal text.
- Subtle borders.
- Minimal shadows.
- Rounded corners, but not excessively rounded.
- Plenty of whitespace.
- Clear typography.
- Consistent spacing.
- Simple icons.
- Restrained accent color.
- Excellent responsive behavior.

Avoid:

- Dark dashboards.
- Excessive gradients.
- Glassmorphism.
- Unnecessary animations.
- Too many cards.
- Complicated navigation.
- Tiny text.
- Technical terminology in user-facing interfaces.
- Overloaded dashboards.

Use a consistent design system with shadcn/ui components.

Recommended components:

- Button
- Card
- Dialog
- Sheet
- Dropdown Menu
- Tabs
- Progress
- Badge
- Tooltip
- Select
- Input
- Textarea
- Alert Dialog
- Skeleton
- Scroll Area
- Separator
- Table

### UX philosophy

The application should behave like a guided assistant.

For example, instead of showing:

"Create audio assets from timeline manifest"

Show:

"Let's create the sounds for your documentary."

Instead of:

"Validate timeline schema"

Show:

"Check your production plan."

Use simple language throughout the application.

Every important action should have:

- A clear title.
- A short explanation.
- One obvious primary action.
- Helpful feedback.
- An understandable error message.

Do not expose technical JSON or API configurations to normal users unless they explicitly open an advanced section.

Use tooltips and short explanations where needed.

# 4. APPLICATION STRUCTURE

Create the following main pages:

1. Dashboard
2. New Project
3. Project Overview
4. Story Director
5. Audio Production
6. Audio Review
7. Visual Storyboard
8. Video Production
9. Media Library
10. Settings

The application should use a project-based workspace.

Each documentary project must have its own:

- Story
- Scripts
- Master timeline
- Audio assets
- Visual assets
- Storyboard
- Rendered videos
- Production history

# 5. DASHBOARD

Create a simple dashboard.

The user should immediately understand what is happening with their projects.

Include:

- Welcome heading.
- Create New Documentary button.
- Recent projects.
- Project thumbnails.
- Project titles.
- Creation dates.
- Current production stage.
- Progress indicators.
- Last updated information.

Use simple production statuses:

- Draft
- Story Approved
- Audio In Progress
- Audio Review
- Audio Locked
- Video In Progress
- Ready to Render
- Completed
- Failed

Do not overload the dashboard with analytics.

The main purpose is to help users continue working on their documentaries.

# 6. PROJECT CREATION

When a user clicks "Create New Documentary", show a simple guided form.

Collect:

- Documentary title.
- Topic or initial story idea.
- Preferred language.
- Approximate video duration.
- Video aspect ratio.
- Visual style.
- Narration preference.

Allow users to start with only a title and story idea.

Suggested aspect ratios:

- 16:9
- 9:16
- 1:1

Suggested visual styles:

- Cinematic Realism
- Documentary
- Historical
- Minimalist
- Dramatic
- Educational

After project creation, guide the user to the Story Director.

# 7. STORY DIRECTOR

This is the starting point of documentary production.

The user should be able to provide:

- A rough story.
- A topic.
- Research notes.
- An existing script.
- A simple idea.

AI should help develop it into a structured documentary.

### Features

1. Improve Story
2. Develop Documentary Structure
3. Generate Narration Script
4. Generate Scene Breakdown
5. Suggest Emotional Progression
6. Generate Master Timeline
7. Edit and Regenerate Individual Sections

AI-generated content should be editable before approval.

The user must approve the story and production plan before audio generation.

### Story output

Generate:

- story.md
- narration.md
- master-timeline.json
- visual-storyboard.json (initial draft, to be refined after audio is locked)

Use structured AI output and validate it with Zod.

Do not rely on unstructured text when generating production data.

# 8. MASTER TIMELINE ENGINE

This is the most important technical component of the entire application.

Create a reusable timeline engine.

The master timeline must contain all planned production events.

It should support:

### Project metadata

- Project ID
- Title
- FPS
- Resolution
- Aspect ratio
- Language
- Estimated duration

### Audio events

- Narration
- Dialogue
- Sound effects
- Ambient sounds
- Music
- Silence or intentional pauses

Each audio event should contain:

- Unique ID
- Type
- Description
- Generation prompt
- Start time
- Planned end time
- Actual duration
- Generated asset path
- Provider
- Generation settings
- Status
- Approval state

### Video scenes and shots

Each scene should contain:

- Scene ID
- Scene title
- Start time
- End time
- Description
- Emotional purpose
- Assigned shots

Each shot should contain:

- Shot ID
- Start time
- End time
- Visual description
- Image/video generation prompt
- Camera movement
- Transition
- Assigned media asset
- Status

### Important timing rules

Store time in seconds internally.

Use milliseconds or frame positions only where appropriate.

Never confuse planned duration with actual generated duration.

Generated narration may be longer or shorter than estimated.

The application must reconcile actual audio durations before the final audio is locked.

Use the project's FPS consistently.

For Remotion:

frame = Math.round(seconds \* fps)

Build validation for:

- Missing assets.
- Invalid timestamps.
- Negative durations.
- Incorrect asset references.
- Unassigned video shots.
- Missing narration.
- Timeline inconsistencies.
- Audio/video duration mismatches.

Create a versioned timeline system.

When a user modifies the approved timeline, track the change and identify which generated assets may need updating.

Do not silently overwrite approved production data.

# 9. AUDIO PRODUCTION

This department generates and manages all audio assets.

Organize audio into five categories:

1. Narration
2. Dialogue
3. Sound Effects
4. Ambience
5. Background Music

Each asset must be individually identifiable.

Example IDs:

- VO_001
- DIALOGUE_001
- SFX_001
- AMBIENCE_001
- MUSIC_001

### Audio generation interface

For each asset display:

- Asset name.
- Type.
- Description.
- Prompt.
- Start time.
- Expected duration.
- Provider.
- Generation status.
- Preview button.
- Regenerate button.
- Upload replacement button.

Support:

- Generate one asset.
- Generate all pending assets.
- Regenerate selected assets.
- Retry failed generation.
- Preview generated files.
- Upload manually generated files.

Show generation progress clearly.

Do not block the entire application while generating audio.

Use background jobs.

### Provider architecture

Create a provider adapter architecture.

Example:

interface SpeechProvider {
generateSpeech(input: SpeechInput): Promise<GeneratedAsset>;
}

interface SoundEffectProvider {
generateSoundEffect(input: SoundEffectInput): Promise<GeneratedAsset>;
}

interface MusicProvider {
generateMusic(input: MusicInput): Promise<GeneratedAsset>;
}

Each provider must implement only the capabilities it actually supports.

Store provider metadata and generation settings for reproducibility.

# 10. AUDIO REVIEW

This stage is where the user reviews and finalizes the complete soundtrack.

Build a simple audio review workspace.

It should contain:

- Audio asset list.
- Audio preview player.
- Waveform visualization.
- Timeline position.
- Track categories.
- Volume adjustment.
- Fade-in and fade-out settings.
- Asset replacement.
- Asset trimming where supported.
- Export controls.

For the first version, do not attempt to recreate a full professional DAW.

Instead:

1. Organize audio assets.
2. Allow basic timing and volume adjustments.
3. Export audio stems or a suitable project for DaVinci Resolve Fairlight.
4. Allow the user to mix professionally in Fairlight.
5. Import the finalized master_audio.wav.

The user must be able to mark the audio as:

"Audio Locked"

Once locked:

- Record the master audio file.
- Record its actual duration.
- Record the audio version.
- Preserve the approved audio assets and timeline.
- Prevent accidental changes without explicit confirmation.

This locked audio becomes the timing reference for video production.

# 11. WHISPER INTEGRATION

Integrate Whisper as an optional local transcription service.

Its primary responsibilities:

- Transcribe narration.
- Generate dialogue timestamps.
- Support subtitle generation.
- Help align spoken words with the final audio.

Use a configurable model size.

Start with a small model suitable for CPU execution.

Do not require a GPU.

Consider a separate Python service or worker integration if that is the most reliable implementation.

Keep Whisper optional.

The application must continue working if Whisper is not installed.

Important: Whisper is not a complete sound-event or emotional-analysis engine. Do not claim that it understands all music transitions, sound effects or emotional changes.

# 12. VISUAL STORYBOARD

This stage begins after the audio is locked.

AI should use:

- Original story.
- Approved narration.
- Master timeline.
- Final audio duration.
- Dialogue timestamps.
- Scene descriptions.
- Emotional progression.

Generate a detailed visual storyboard.

Each scene should be divided into individual shots.

Example:

Scene 1: The Storm

Shot 1:

- Duration: 5 seconds.
- Wide exterior shot of a building during heavy rain.
- Camera: Slow dolly toward the building.

Shot 2:

- Duration: 6 seconds.
- Interior shot of a dark room.
- Camera: Slow movement toward the desk.

Shot 3:

- Duration: 7 seconds.
- Close-up of a worried student.
- Camera: Slow push-in.

The storyboard should provide:

- Shot number.
- Duration.
- Start and end time.
- Visual description.
- AI generation prompt.
- Camera movement.
- Mood.
- Lighting.
- Reference to related audio events.

Allow users to edit shots and prompts.

# 13. VIDEO PRODUCTION

Build the video production workspace using Remotion.

The application must be able to:

- Import images.
- Import video footage.
- Assign media to shots.
- Preview each shot.
- Preview complete scenes.
- Set shot duration.
- Add camera movements.
- Add transitions.
- Add subtitles.
- Add text overlays.
- Render the final video.

Support:

- 1080p.
- 720p.
- 16:9.
- 9:16.
- 1:1.

Use Remotion for programmatic composition and rendering.

Keep the renderer independent from the Next.js UI.

The renderer should consume validated project data and media references.

### Audio synchronization

Use the locked master audio as the primary soundtrack.

Do not accidentally play both the final mixed master audio and the original individual audio tracks.

That would duplicate the sound.

All visual shot positions must be derived from the approved timeline.

Ensure the final composition duration matches the intended final audio duration.

Provide a preview before rendering.

Show render progress and errors.

# 14. MEDIA LIBRARY

Create a centralized media library.

Organize:

- Audio
- Images
- Videos
- Generated assets
- Uploaded assets
- Rendered outputs

Features:

- Search.
- Filter by type.
- Preview.
- Rename.
- Replace.
- Delete with confirmation.
- Show which scene or project uses an asset.

Store media files on local disk initially.

Do not store large binary files directly inside MongoDB documents.

Store file paths and metadata in MongoDB.

Design a storage adapter so cloud storage can be added later.

# 15. BACKEND ARCHITECTURE

Separate the frontend, backend logic and production worker.

Recommended architecture:

apps/
web/
Next.js application

worker/
Node.js background worker

packages/
database/
timeline/
providers/
media/
renderer/
shared/

The worker should handle:

- AI generation.
- Audio generation.
- Transcription.
- Media processing.
- Video rendering.

Use a persistent job system.

Jobs should have:

- ID.
- Project ID.
- Job type.
- Input.
- Status.
- Progress.
- Error details.
- Created time.
- Updated time.

Support:

- Pending.
- Running.
- Completed.
- Failed.
- Cancelled.

Implement retry logic where appropriate.

Do not use in-memory-only job tracking for production tasks.

For the first local version, use MongoDB-backed job records and a worker that safely claims pending jobs. Design it so a proper queue can be introduced later.

# 16. MONGODB DATA MODELS

Design clean MongoDB collections for:

- Users (only if authentication is introduced)
- Projects
- Timelines
- Scenes
- Shots
- AudioAssets
- MediaAssets
- GenerationJobs
- RenderJobs
- ProjectVersions
- ProviderSettings

Avoid putting the entire application state in one massive MongoDB document.

Use references for large or frequently updated collections.

Add indexes for project IDs, statuses and commonly queried fields.

Use proper validation.

# 17. SETTINGS

Create a simple settings page.

Include:

- AI provider configuration.
- API key management.
- Default language.
- Default FPS.
- Default resolution.
- Default aspect ratio.
- Media storage location.
- Whisper configuration.
- Rendering preferences.

API keys must be stored securely and never returned in normal frontend API responses.

Show connection status for each provider.

Allow the user to test a provider connection.

Do not require every provider to be configured before creating a project.

# 18. ERROR HANDLING AND USER FEEDBACK

Professional software must handle failures properly.

Examples:

If audio generation fails:

- Show which asset failed.
- Explain the error in simple language.
- Offer Retry.
- Preserve all successful assets.

If an asset is missing:

- Identify the missing asset.
- Show which scene needs it.

If rendering fails:

- Preserve the project.
- Show useful error information.
- Allow retry.

Never silently lose project data.

Use confirmation dialogs for destructive actions.

Add autosave for user-edited scripts and prompts.

Show loading states and progress indicators.

# 19. DEVELOPMENT RULES

Follow these rules strictly:

1. Use TypeScript throughout.
2. Keep components small and reusable.
3. Use shadcn/ui consistently.
4. Keep the interface white-themed.
5. Keep user-facing language simple.
6. Separate business logic from UI components.
7. Validate all AI-generated structured data.
8. Use server-side provider integrations.
9. Never expose API keys.
10. Never fake successful AI generation.
11. Never show fake progress.
12. Do not hard-code generated media paths.
13. Keep the timeline engine independent.
14. Make media processing resilient.
15. Make every important action functional.
16. Add proper empty, loading, success and error states.
17. Avoid unnecessary dependencies.
18. Write maintainable code with clear naming.
19. Add tests for timeline validation and time conversion.
20. Keep the application usable without configuring every external AI provider.

If a provider is not configured, show a clear setup message and offer manual upload.

Do not build decorative buttons that do nothing.

# 20. IMPLEMENTATION STRATEGY

Do not attempt to implement the entire application in one uncontrolled step.

Work in phases.

### Phase 1 — Foundation

- Inspect the existing repository.
- Set up Next.js and TypeScript.
- Configure Tailwind and shadcn/ui.
- Connect MongoDB.
- Build the dashboard.
- Build project creation.
- Implement project persistence.
- Design the master timeline schema.

### Phase 2 — Story Director

- Implement AI provider abstraction.
- Integrate the selected AI provider.
- Generate stories and narration.
- Generate validated master timelines.
- Add editing and approval.

### Phase 3 — Audio Production

- Implement provider adapters.
- Implement audio generation jobs.
- Add asset management.
- Add preview and manual uploads.
- Add retry and progress tracking.

### Phase 4 — Audio Review

- Implement audio review workspace.
- Implement waveform visualization.
- Export stems.
- Support importing master_audio.wav.
- Implement audio locking.

### Phase 5 — Video Production

- Implement storyboard generation.
- Implement media assignment.
- Build Remotion compositions.
- Implement synchronized rendering.
- Add subtitles and final export.

### Phase 6 — Polish

- Improve usability.
- Test error scenarios.
- Add backups and recovery.
- Optimize rendering.
- Add documentation.

# 21. FIRST TASK — BEFORE WRITING CODE

Start by inspecting the existing repository.

Then provide:

1. A concise architecture overview.
2. The proposed folder structure.
3. The MongoDB data model.
4. The master timeline TypeScript/Zod schema.
5. The development phases and dependencies.
6. Any technical risks or decisions that need attention.

Do not immediately generate hundreds of files.

First establish a clean foundation and explain the implementation plan.

After that, begin Phase 1.

Implement actual working functionality, not just mockups.

When completing each phase:

- Run TypeScript checks.
- Run linting.
- Run relevant tests.
- Fix errors before moving forward.
- Summarize what was implemented.
- Identify anything that still requires an external API key or manual setup.

If you encounter a missing API key or unavailable external service, continue building the rest of the application with a clearly labeled integration placeholder and a working manual-upload alternative.

# FINAL PRODUCT REQUIREMENT

The final product should feel like a simple documentary production assistant.

A normal user should be able to:

1. Enter a story idea.
2. Generate a documentary script.
3. Generate narration, sound effects and music.
4. Review and approve the audio.
5. Generate a visual storyboard.
6. Add generated or uploaded visuals.
7. Render a synchronized documentary.

The user should not need to understand JSON, APIs, frame calculations, audio codecs or Remotion.

Those complexities should remain inside the application.

**Build a professional production system with the simplicity of a modern productivity app.**

The product name is Documentary Studio.

The design theme is WHITE.

The primary UI library is shadcn/ui.

The core technical principle is AUDIO FIRST, VIDEO SECOND.

Start by inspecting the repository and presenting the architecture plan.

### ADDITIONAL FEATURE: Unified Timeline Editor

Build a dedicated interactive Timeline Editor that displays all audio and video tracks together on one synchronized timeline.

Requirements:

- Separate tracks for narration, dialogue, SFX, ambience, music, video clips, images and subtitles.
- Display audio waveforms and video clip thumbnails.
- Shared time ruler and playhead.
- Play, pause and timeline scrubbing.
- Zoom in/out.
- Drag and drop clips.
- Adjust clip positions and durations.
- Preview audio and video together.
- Support track muting and visibility.
- Keep all changes synchronized with the master timeline.
- Use the locked master audio as the final soundtrack.

Build this as a custom React interface. Remotion should handle video composition and rendering, not the interactive editing UI.

The interface must remain simple enough for non-technical users.
