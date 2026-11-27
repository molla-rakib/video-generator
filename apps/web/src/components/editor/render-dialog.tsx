"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Download, Film, Loader2, XCircle } from "lucide-react";
import {
  ASPECT_RATIOS,
  ASPECT_RATIO_LABELS,
  dimensionsFor,
  FPS_OPTIONS,
  RESOLUTION_LABELS,
  RESOLUTIONS,
  type AspectRatio,
  type Resolution,
} from "@studio/shared";
import { checkRenderReadiness, formatClock, timelineDuration } from "@studio/timeline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isBusy, mediaUrl, useEditorContext } from "./context";
import { useEditor } from "./store";

export function RenderDialog() {
  const { store, media, jobs, startJob, fileVersions } = useEditorContext();
  const timeline = useEditor(store, (s) => s.timeline);
  const [ratios, setRatios] = useState<AspectRatio[]>(() => [...new Set([timeline.ratio, ...timeline.ratios])]);
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [fps, setFps] = useState(String(timeline.fps));
  const [format, setFormat] = useState<"mp4" | "webm">("mp4");

  const present = useMemo(() => new Set(Object.entries(fileVersions).filter(([, v]) => v).map(([p]) => p)), [fileVersions]);
  const issues = checkRenderReadiness(timeline, present);
  const errors = issues.filter((i) => i.severity === "error");
  const running = isBusy(jobs, "render");
  const lastFailed = jobs.find((j) => j.type === "render" && j.status === "failed");
  const renders = media.filter((m) => m.kind === "render");

  const toggle = (r: AspectRatio) => setRatios((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm">
          {running ? <Loader2 className="animate-spin" /> : <Film />} {running ? `Exporting ${Math.round(running.progress * 100)}%` : "Export"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Export your video</DialogTitle>
          <DialogDescription>
            Renders a finished MP4 for each shape you pick ({formatClock(timelineDuration(timeline))} long). Sound is balanced to {timeline.mix.targetLufs} LUFS
            for social media. It runs in the background — you can keep editing.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">Shapes</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ASPECT_RATIOS.map((r) => {
              const on = ratios.includes(r);
              const { width, height } = dimensionsFor(r, resolution);
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(r)}
                  className={cn("rounded-lg border p-2.5 text-left transition-colors hover:bg-surface", on && "border-brand bg-brand-soft/60")}
                >
                  <span className="block text-sm font-medium">{r}</span>
                  <span className="block text-xs text-muted-foreground">{ASPECT_RATIO_LABELS[r].hint}</span>
                  <span className="block text-[11px] tabular-nums text-muted-foreground">
                    {width}×{height}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Resolution</Label>
            <Select value={resolution} onValueChange={(v) => setResolution(v as Resolution)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOLUTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {RESOLUTION_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Frame rate</Label>
            <Select value={fps} onValueChange={setFps}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FPS_OPTIONS.map((f) => (
                  <SelectItem key={f} value={String(f)}>
                    {f} fps
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as "mp4" | "webm")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mp4">MP4 (H.264)</SelectItem>
                <SelectItem value="webm">WebM</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {resolution === "2160p" ? <p className="-mt-2 text-xs text-muted-foreground">4K exports take noticeably longer.</p> : null}

        {issues.length ? (
          <ul className="max-h-40 space-y-1.5 overflow-y-auto">
            {issues.map((i, n) => (
              <li key={n} className={`flex gap-2 rounded-md p-2 text-sm ${i.severity === "error" ? "bg-destructive-soft" : "bg-warning-soft"}`}>
                {i.severity === "error" ? <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />}
                {i.message}
              </li>
            ))}
          </ul>
        ) : null}

        {running ? (
          <div className="space-y-1.5 rounded-lg border p-3">
            <div className="flex justify-between text-sm">
              <span>{running.status === "pending" ? "Waiting for the renderer…" : running.progressMessage || "Exporting"}</span>
              <span className="tabular-nums">{Math.round(running.progress * 100)}%</span>
            </div>
            <Progress value={running.progress * 100} />
          </div>
        ) : lastFailed && !renders.some((r) => r.createdAt > lastFailed.updatedAt) ? (
          <p className="rounded-md bg-destructive-soft p-2 text-sm">Last export failed: {lastFailed.error?.userMessage}</p>
        ) : null}

        <Button
          disabled={Boolean(running) || errors.length > 0 || ratios.length === 0}
          onClick={() => void startJob("render", { ratios: ASPECT_RATIOS.filter((r) => ratios.includes(r)), resolution, format, fps: Number(fps) })}
        >
          <Film />{" "}
          {errors.length
            ? "Fix the problems above first"
            : ratios.length === 0
              ? "Pick at least one shape"
              : `Export ${ratios.length} video${ratios.length === 1 ? "" : "s"}`}
        </Button>

        {renders.length ? (
          <div className="space-y-2 border-t pt-3">
            <h3 className="text-sm font-medium">Finished videos</h3>
            <ul className="max-h-56 space-y-2 overflow-y-auto">
              {renders.slice(0, 12).map((r) => (
                <li key={r.id} className="flex items-center gap-3">
                  <video src={mediaUrl(r.id)} className="h-12 w-20 rounded bg-black object-contain" preload="metadata" controls={false} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.width && r.height ? `${r.width}×${r.height} · ` : ""}
                      {r.durationSeconds ? formatClock(r.durationSeconds) : ""} · {(r.sizeBytes / 1024 / 1024).toFixed(1)} MB · {formatRelative(r.createdAt)}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <a href={mediaUrl(r.id, "download")}>
                      <Download /> Download
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
