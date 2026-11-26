import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getProject, getTimeline, listMediaAssets, touchProject, updateTimeline, type JobInput } from "@studio/database";
import { convertToSpeechWav, getStorage, projectKey } from "@studio/media";
import { getTranscriber, type Transcript } from "@studio/providers";
import { buildSubtitleCues, placeSubtitles } from "@studio/timeline";
import type { JobContext } from "../context";
import { userError } from "../context";

/**
 * Transcribe narration clips with Whisper and place timed Bangla subtitles
 * under them. Transcripts are cached per audio file.
 */
export async function runSubtitles(ctx: JobContext, input: JobInput<"subtitles.generate">): Promise<Record<string, unknown>> {
  const [project, { timeline }] = await Promise.all([getProject(ctx.projectId), getTimeline(ctx.projectId)]);
  const narrationTracks = new Set(timeline.tracks.filter((t) => t.kind === "audio" && (t.role === "narration" || t.role === "dialogue")).map((t) => t.id));
  const clips = timeline.clips.filter(
    (c) => c.kind === "audio" && c.assetId && (input.clipIds.length ? input.clipIds.includes(c.id) : narrationTracks.has(c.trackId)),
  );
  if (clips.length === 0) throw userError("There's no narration on the timeline to transcribe yet.");
  const transcriber = await getTranscriber();
  const storage = getStorage();
  const assetIds = [...new Set(clips.map((c) => c.assetId!))];
  const assets = new Map((await listMediaAssets({ projectId: ctx.projectId, ids: assetIds })).map((a) => [a.id, a]));
  const transcripts = new Map<string, Transcript>();
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-stt-"));
  try {
    let i = 0;
    for (const id of assetIds) {
      const asset = assets.get(id);
      if (!asset || asset.status !== "ready") continue;
      await ctx.progress(i / assetIds.length, `${transcriber.label}: listening to “${asset.name}” (${i + 1} of ${assetIds.length})`);
      const cacheKey = projectKey(ctx.projectId, "derived", `${id}.transcript.${transcriber.id}.json`);
      const cached = await storage.stat(cacheKey);
      if (cached) {
        transcripts.set(id, JSON.parse(await streamToString(storage.read(cacheKey))) as Transcript);
      } else {
        const wav = path.join(dir, `${id}.wav`);
        await convertToSpeechWav(await storage.localPath(asset.storageKey), wav);
        const transcript = await transcriber.transcribe({ filePath: wav, language: project.language });
        await storage.put(cacheKey, Buffer.from(JSON.stringify(transcript)));
        transcripts.set(id, transcript);
      }
      await ctx.checkCancelled();
      i++;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  await ctx.progress(0.95, "Placing subtitles on the timeline");
  let cueCount = 0;
  await updateTimeline(ctx.projectId, (t) => {
    let next = t;
    for (const clip of clips) {
      const transcript = transcripts.get(clip.assetId!);
      const current = next.clips.find((c) => c.id === clip.id);
      if (!transcript || !current) continue;
      const cues = buildSubtitleCues(transcript.words, transcript.segments);
      cueCount += cues.length;
      next = placeSubtitles(next, current, cues);
    }
    return next;
  });
  await touchProject(ctx.projectId, "Subtitles created");
  return { cues: cueCount };
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}
