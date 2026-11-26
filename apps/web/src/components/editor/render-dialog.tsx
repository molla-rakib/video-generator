"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Download, Film, Loader2, XCircle } from "lucide-react";
import { checkRenderReadiness, formatClock, timelineDuration } from "@studio/timeline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRelative } from "@/lib/format";
import { isBusy, mediaUrl, useEditorContext } from "./context";
import { useEditor } from "./store";

export function RenderDialog() {
  const { store, media, jobs, startJob } = useEditorContext();
  const timeline = useEditor(store, (s) => s.timeline);
  const [resolution, setResolution] = useState<"1080p" | "720p">("1080p");
  const [fps, setFps] = useState(String(timeline.fps));
  const [format, setFormat] = useState<"mp4" | "webm">("mp4");

  const ready = useMemo(() => new Set(media.filter((m) => m.status === "ready").map((m) => m.id)), [media]);
  const issues = checkRenderReadiness(timeline, ready);
  const errors = issues.filter((i) => i.severity === "error");
  const running = isBusy(jobs, "render");
  const lastFailed = jobs.find((j) => j.type === "render" && j.status === "failed");
  const renders = media.filter((m) => m.kind === "render");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm">
          {running ? <Loader2 className="animate-spin" /> : <Film />} {running ? `Rendering ${Math.round(running.progress * 100)}%` : "Render"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Render your documentary</DialogTitle>
          <DialogDescription>
            Creates a finished video file from the timeline ({formatClock(timelineDuration(timeline))} long). It runs in the background — you can keep editing.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Quality</Label>
            <Select value={resolution} onValueChange={(v) => setResolution(v as "1080p" | "720p")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1080p">1080p</SelectItem>
                <SelectItem value="720p">720p</SelectItem>
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
                {["24", "25", "30"].map((f) => (
                  <SelectItem key={f} value={f}>
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
              <span>{running.status === "pending" ? "Waiting for the renderer…" : running.progressMessage || "Rendering"}</span>
              <span className="tabular-nums">{Math.round(running.progress * 100)}%</span>
            </div>
            <Progress value={running.progress * 100} />
          </div>
        ) : lastFailed && !renders.some((r) => r.createdAt > lastFailed.updatedAt) ? (
          <p className="rounded-md bg-destructive-soft p-2 text-sm">Last render failed: {lastFailed.error?.userMessage}</p>
        ) : null}

        <Button
          disabled={Boolean(running) || errors.length > 0}
          onClick={() => void startJob("render", { resolution, format, fps: Number(fps) })}
        >
          <Film /> {errors.length ? "Fix the problems above first" : "Start rendering"}
        </Button>

        {renders.length ? (
          <div className="space-y-2 border-t pt-3">
            <h3 className="text-sm font-medium">Finished videos</h3>
            <ul className="space-y-2">
              {renders.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center gap-3">
                  <video src={mediaUrl(r.id)} className="h-12 w-20 rounded bg-black object-contain" preload="metadata" controls={false} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
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
