import { staticFile } from "remotion";
import type { DocSpec, MediaItem } from "../lib/spec/schema";

/** Remote URLs are used as-is; anything else is a file in /public. */
export function resolveSrc(src: string): string {
  return /^https?:\/\//.test(src) ? src : staticFile(src);
}

export function mediaMap(spec: DocSpec): Map<string, MediaItem> {
  return new Map(spec.media.map((m) => [m.id, m]));
}
