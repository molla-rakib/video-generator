import { getStorage } from "@studio/media";
import { enqueue } from "../jobs-catalog";
import type { MediaKind, MediaOrigin } from "../models";
import { createMediaAsset, listMediaAssets, type MediaAsset } from "./media";
import { projectFile } from "./project-file";

const KIND_BY_EXT: Record<string, { kind: MediaKind; mime: string }> = {
  mp3: { kind: "audio", mime: "audio/mpeg" },
  wav: { kind: "audio", mime: "audio/wav" },
  m4a: { kind: "audio", mime: "audio/mp4" },
  aac: { kind: "audio", mime: "audio/aac" },
  ogg: { kind: "audio", mime: "audio/ogg" },
  flac: { kind: "audio", mime: "audio/flac" },
  png: { kind: "image", mime: "image/png" },
  jpg: { kind: "image", mime: "image/jpeg" },
  jpeg: { kind: "image", mime: "image/jpeg" },
  webp: { kind: "image", mime: "image/webp" },
  mp4: { kind: "video", mime: "video/mp4" },
  mov: { kind: "video", mime: "video/quicktime" },
  webm: { kind: "video", mime: "video/webm" },
};

export function mediaKindForPath(path: string): { kind: MediaKind; mime: string } | null {
  return KIND_BY_EXT[path.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

/**
 * Make sure files that were written straight into the project folder (by
 * the sample builder or the AI agent) appear in the media list with a
 * waveform / thumbnail. Unknown files and files already registered are
 * skipped. Returns the newly registered assets.
 */
export async function registerProjectFiles(
  projectId: string,
  files: Array<{ path: string; role?: string | null; name?: string; prompt?: string | null }>,
  origin: MediaOrigin = "generated",
): Promise<MediaAsset[]> {
  const storage = getStorage();
  const keys = files.map((f) => projectFile(projectId, f.path));
  const existing = new Set((await listMediaAssets({ projectId, storageKeys: keys })).map((a) => a.storageKey));
  const created: MediaAsset[] = [];
  for (const [i, file] of files.entries()) {
    const key = keys[i]!;
    const type = mediaKindForPath(file.path);
    if (!type || existing.has(key)) continue;
    const info = await storage.stat(key);
    if (!info) continue;
    const asset = await createMediaAsset({
      projectId,
      kind: type.kind,
      origin,
      role: file.role ?? (type.kind === "audio" ? null : "visual"),
      name: file.name ?? file.path.split("/").pop()!.replace(/\.[^.]+$/, ""),
      storageKey: key,
      mimeType: type.mime,
      sizeBytes: info.sizeBytes,
      prompt: file.prompt ?? null,
    });
    await enqueue("media.process", projectId, { assetId: asset.id }, `Preparing “${asset.name}”`);
    created.push(asset);
  }
  return created;
}
