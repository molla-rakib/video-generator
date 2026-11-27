import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { getTimeline, projectFile, registerProjectFiles, touchProject, updateTimeline } from "@studio/database";
import { getStorage, probeMedia, safeFileName } from "@studio/media";
import { UserFacingError } from "@studio/shared";
import { addClip, clipEnd, ensureTrack, formatClock, parseSubtitles, SubtitleParseError, updateTrack, type ParsedSubtitles, type Timeline } from "@studio/timeline";

/**
 * The two inputs of every video: the voiceover and its subtitle file.
 * They are stored in the project's input/ folder; the subtitles are also
 * parsed into input/subtitles.json (cues + emotion hints) for the animator.
 */

export const VOICE_EXTENSIONS = ["mp3", "wav", "m4a", "aac", "ogg", "flac"] as const;
export const SUBTITLE_EXTENSIONS = ["srt", "vtt"] as const;
const MAX_VOICE_BYTES = 1024 ** 3;
const MAX_SUBTITLE_BYTES = 5 * 1024 ** 2;

const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

async function removeOld(projectId: string, base: string, exts: readonly string[]) {
  const storage = getStorage();
  for (const ext of exts) await storage.delete(projectFile(projectId, `input/${base}.${ext}`)).catch(() => {});
}

export async function saveVoice(projectId: string, name: string, body: ReadableStream<Uint8Array>, length: number): Promise<string> {
  const ext = extOf(name);
  if (!(VOICE_EXTENSIONS as readonly string[]).includes(ext)) throw new UserFacingError("The voiceover must be an MP3, WAV or M4A file.");
  if (length > MAX_VOICE_BYTES) throw new UserFacingError("The voiceover is larger than 1 GB.");
  await removeOld(projectId, "voice", VOICE_EXTENSIONS);
  const path = `input/voice.${ext}`;
  const { sizeBytes } = await getStorage().put(projectFile(projectId, path), Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>));
  if (sizeBytes === 0) throw new UserFacingError("The voiceover file is empty.");
  return path;
}

export async function saveSubtitles(projectId: string, name: string, text: string): Promise<{ path: string; parsed: ParsedSubtitles }> {
  const ext = extOf(name);
  if (!(SUBTITLE_EXTENSIONS as readonly string[]).includes(ext)) throw new UserFacingError("The subtitles must be an SRT or VTT file.");
  if (Buffer.byteLength(text) > MAX_SUBTITLE_BYTES) throw new UserFacingError("The subtitle file is too large.");
  let parsed: ParsedSubtitles;
  try {
    parsed = parseSubtitles(text);
  } catch (error) {
    if (error instanceof SubtitleParseError) throw new UserFacingError(error.message);
    throw error;
  }
  await removeOld(projectId, "subtitles", SUBTITLE_EXTENSIONS);
  const storage = getStorage();
  const path = `input/subtitles.${ext}`;
  await storage.put(projectFile(projectId, path), Buffer.from(text, "utf8"));
  await storage.put(projectFile(projectId, "input/subtitles.json"), Buffer.from(JSON.stringify(parsed, null, 2), "utf8"));
  return { path, parsed };
}

/** Decode subtitle bytes whatever tool saved them (UTF-8 with/without BOM, UTF-16). */
export function decodeSubtitleBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

export const MAX_REFERENCES = 10;
const REFERENCE_EXT = ["png", "jpg", "jpeg", "webp"];
const ASSET_EXT = ["png", "jpg", "jpeg", "webp", "gif", "svg", "mp3", "wav", "m4a", "ogg", "mp4", "webm", "mov", "json"];
const MAX_ASSET_BYTES = 200 * 1024 ** 2;

async function listDir(projectId: string, dir: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const abs = await getStorage().localPath(projectFile(projectId, `${dir}/x`));
  return readdir(abs.slice(0, -2)).catch(() => []);
}

/** A picture showing how a character or place should look (input/references/). */
export async function saveReference(projectId: string, name: string, body: ReadableStream<Uint8Array>): Promise<string> {
  if (!REFERENCE_EXT.includes(extOf(name))) throw new UserFacingError("Reference images must be PNG, JPG or WebP.");
  const existing = await listDir(projectId, "input/references");
  if (existing.length >= MAX_REFERENCES) throw new UserFacingError(`Up to ${MAX_REFERENCES} reference images.`);
  const path = `input/references/${String(existing.length + 1).padStart(2, "0")}-${safeFileName(name, "reference")}`;
  await getStorage().put(projectFile(projectId, path), Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>));
  return path;
}

/** A file from the user's asset folder, keeping its sub-folders (input/assets/…). */
export async function saveAsset(projectId: string, relativePath: string, body: ReadableStream<Uint8Array>, length: number): Promise<string> {
  const segments = relativePath.split(/[\\/]+/).filter(Boolean).slice(-4);
  if (!segments.length || !ASSET_EXT.includes(extOf(segments.at(-1)!))) throw new UserFacingError("Only pictures, sounds, videos and JSON can be used as assets.");
  if (length > MAX_ASSET_BYTES) throw new UserFacingError("An asset is larger than 200 MB.");
  const clean = segments.map((s, i) => (i === segments.length - 1 ? safeFileName(s, "asset") : safeFileName(s, "folder").replace(/\.[^.]*$/, "")));
  const path = `input/assets/${clean.join("/")}`;
  await getStorage().put(projectFile(projectId, path), Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>));
  return path;
}

async function findInput(projectId: string, base: string, exts: readonly string[]): Promise<string | null> {
  const storage = getStorage();
  for (const ext of exts) if (await storage.stat(projectFile(projectId, `input/${base}.${ext}`))) return `input/${base}.${ext}`;
  return null;
}

/**
 * Put the voiceover (locked) and the captions from the subtitles on the
 * timeline. Running it again replaces them. Returns warnings to show.
 */
export async function applyInputs(projectId: string): Promise<{ warnings: string[]; durationSeconds: number; cues: number }> {
  const voicePath = await findInput(projectId, "voice", VOICE_EXTENSIONS);
  if (!voicePath) throw new UserFacingError("Upload the voiceover first.");
  const subsFile = projectFile(projectId, "input/subtitles.json");
  if (!(await getStorage().stat(subsFile))) throw new UserFacingError("Upload the subtitle file first.");
  const parsed = JSON.parse(await readFile(await getStorage().localPath(subsFile), "utf8")) as ParsedSubtitles;

  let durationSeconds: number;
  try {
    const info = await probeMedia(await getStorage().localPath(projectFile(projectId, voicePath)));
    if (!info.durationSeconds || !info.hasAudio) throw new Error("no audio");
    durationSeconds = info.durationSeconds;
  } catch {
    throw new UserFacingError("The voiceover couldn't be read as audio. Try exporting it again as MP3 or WAV.");
  }

  const warnings = [...parsed.warnings];
  const lastEnd = parsed.cues.at(-1)!.end;
  if (lastEnd > durationSeconds + 0.5) {
    warnings.push(`The subtitles run until ${formatClock(lastEnd)} but the voiceover is only ${formatClock(durationSeconds)} long. Check that they belong together.`);
  } else if (lastEnd < durationSeconds * 0.6) {
    warnings.push(`The subtitles end at ${formatClock(lastEnd)}, well before the voiceover ends (${formatClock(durationSeconds)}). Some speech may have no subtitles.`);
  }

  await updateTimeline(
    projectId,
    (t0) => {
      let t: Timeline = t0;
      // Voice: replace, on the voice track, then lock it.
      const voice = ensureTrack(t, "voice");
      t = updateTrack(voice.timeline, voice.track.id, { locked: false });
      t = { ...t, clips: t.clips.filter((c) => !(c.trackId === voice.track.id && c.src?.startsWith("input/voice."))) };
      t = addClip(t, {
        trackId: voice.track.id,
        kind: "audio",
        src: voicePath,
        label: "Voiceover",
        start: 0,
        duration: durationSeconds,
        sourceDuration: durationSeconds,
        volume: 1,
        meta: { source: "input" },
      }).timeline;
      t = updateTrack(t, voice.track.id, { locked: true });

      // Captions: one clip per subtitle cue.
      const captions = ensureTrack(t, "captions");
      t = { ...captions.timeline, clips: captions.timeline.clips.filter((c) => !(c.trackId === captions.track.id && c.meta.source === "subtitles")) };
      for (const cue of parsed.cues) {
        const prevEnd = Math.max(0, ...t.clips.filter((c) => c.trackId === captions.track.id).map(clipEnd));
        const start = Math.max(cue.start, prevEnd);
        if (cue.end - start < 0.1) continue;
        t = addClip(t, {
          trackId: captions.track.id,
          kind: "caption",
          text: cue.text,
          start,
          duration: Math.round((cue.end - start) * 1000) / 1000,
          meta: { source: "subtitles", cue: cue.index, ...(cue.tags.length ? { tags: cue.tags } : {}) },
        }).timeline;
      }
      return t;
    },
    "system",
  );

  await registerProjectFiles(projectId, [{ path: voicePath, role: "voice", name: "Voiceover" }], "uploaded");
  await touchProject(projectId, "Voiceover and subtitles added");
  return { warnings, durationSeconds, cues: parsed.cues.length };
}

/** For the editor/agent: is the input in place? */
export async function inputStatus(projectId: string) {
  const [voice, subtitles, { timeline }] = await Promise.all([
    findInput(projectId, "voice", VOICE_EXTENSIONS),
    findInput(projectId, "subtitles", SUBTITLE_EXTENSIONS),
    getTimeline(projectId),
  ]);
  return { voice, subtitles, onTimeline: timeline.clips.some((c) => c.src?.startsWith("input/voice.")) };
}
