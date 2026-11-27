import { clipEnd, timelineDuration, type Timeline } from "./editor";

export interface RenderIssue {
  severity: "error" | "warning";
  message: string;
  clipId?: string;
}

/**
 * Check a project before exporting. `files` is the set of project-relative
 * paths that exist on disk (media files and scene components); clips
 * pointing anywhere else would render blank.
 */
export function checkRenderReadiness(t: Timeline, files: ReadonlySet<string>): RenderIssue[] {
  const issues: RenderIssue[] = [];
  if (t.clips.length === 0) {
    issues.push({ severity: "error", message: "The timeline is empty. Add scenes, video, pictures or sound first." });
    return issues;
  }
  for (const c of t.clips) {
    const name = `"${c.label || c.src || c.component || c.kind}"`;
    if ((c.kind === "audio" || c.kind === "video" || c.kind === "image") && (!c.src || !files.has(c.src))) {
      issues.push({ severity: "error", clipId: c.id, message: `${name} uses a file that is missing.` });
    }
    if (c.kind === "scene" && (!c.component || !files.has(c.component))) {
      issues.push({ severity: "error", clipId: c.id, message: `The scene ${name} is missing its component file.` });
    }
    if (c.sourceDuration !== null && c.sourceStart + c.duration > c.sourceDuration + 0.05) {
      issues.push({ severity: "warning", clipId: c.id, message: `${name} is longer than its media; the end will freeze or go silent.` });
    }
    if ((c.kind === "caption" || c.kind === "title") && !c.text.trim()) {
      issues.push({ severity: "warning", clipId: c.id, message: "A text clip is empty." });
    }
  }

  // Black gaps in the picture (overlays don't count: they sit on top).
  const shownTracks = new Set(t.tracks.filter((tr) => tr.kind === "video" && !tr.hidden).map((tr) => tr.id));
  const visual = t.clips
    .filter((c) => (c.kind === "scene" || c.kind === "image" || c.kind === "video") && shownTracks.has(c.trackId))
    .filter((c) => c.layout.default === null)
    .sort((a, b) => a.start - b.start);
  if (visual.length === 0) {
    issues.push({ severity: "warning", message: "Nothing fills the screen yet — the video will be black." });
    return issues;
  }
  let covered = 0;
  for (const c of visual) {
    if (c.start - covered > 0.5) {
      issues.push({ severity: "warning", message: `The screen is black from ${covered.toFixed(1)} s to ${c.start.toFixed(1)} s.` });
    }
    covered = Math.max(covered, clipEnd(c));
  }
  const total = timelineDuration(t);
  if (total - covered > 0.5) {
    issues.push({ severity: "warning", message: `The screen is black for the last ${(total - covered).toFixed(1)} s.` });
  }
  return issues;
}

/** Every project file a timeline refers to (media and scene components). */
export function referencedFiles(t: Timeline): string[] {
  const out = new Set<string>();
  for (const c of t.clips) {
    if (c.src) out.add(c.src);
    if (c.component) out.add(c.component);
  }
  return [...out];
}
