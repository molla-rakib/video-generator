import { clipEnd, timelineDuration, type Timeline } from "./editor";

export interface RenderIssue {
  severity: "error" | "warning";
  message: string;
  clipId?: string;
}

/**
 * Check a timeline before rendering. `assetIds` is the set of media that
 * exists and is ready; clips pointing anywhere else would render blank.
 */
export function checkRenderReadiness(t: Timeline, assetIds: ReadonlySet<string>): RenderIssue[] {
  const issues: RenderIssue[] = [];
  if (t.clips.length === 0) {
    issues.push({ severity: "error", message: "The timeline is empty. Add narration, pictures or video first." });
    return issues;
  }
  for (const c of t.clips) {
    if ((c.kind === "audio" || c.kind === "video" || c.kind === "image") && (!c.assetId || !assetIds.has(c.assetId))) {
      issues.push({ severity: "error", clipId: c.id, message: `"${c.label || c.kind}" uses a file that is missing or still processing.` });
    }
    if (c.sourceDuration !== null && c.sourceStart + c.duration > c.sourceDuration + 0.05) {
      issues.push({ severity: "warning", clipId: c.id, message: `"${c.label || c.kind}" is longer than its media; the end will freeze or go silent.` });
    }
    if ((c.kind === "subtitle" || c.kind === "title") && !c.text.trim()) {
      issues.push({ severity: "warning", clipId: c.id, message: "A text clip is empty." });
    }
  }
  const hasVisual = t.clips.some((c) => (c.kind === "image" || c.kind === "video") && !t.tracks.find((tr) => tr.id === c.trackId)?.hidden);
  if (!hasVisual) issues.push({ severity: "warning", message: "There are no pictures or video yet — the screen will be black." });

  // Black gaps on the main picture lane.
  const visual = t.clips
    .filter((c) => c.kind === "image" || c.kind === "video")
    .sort((a, b) => a.start - b.start);
  let covered = 0;
  for (const c of visual) {
    if (c.start - covered > 0.5) {
      issues.push({ severity: "warning", message: `The screen is black from ${covered.toFixed(1)} s to ${c.start.toFixed(1)} s.` });
    }
    covered = Math.max(covered, clipEnd(c));
  }
  const total = timelineDuration(t);
  if (visual.length && total - covered > 0.5) {
    issues.push({ severity: "warning", message: `The screen is black for the last ${(total - covered).toFixed(1)} s.` });
  }
  return issues;
}
