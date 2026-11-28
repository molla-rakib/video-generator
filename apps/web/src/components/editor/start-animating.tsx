"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, Clapperboard, Loader2, Music, Pause, Play, RotateCcw, ScanEye, Sparkles, Square, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { formatClock } from "@studio/timeline";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { isBusy, useEditorContext } from "./context";
import { useEditor } from "./store";

/** The phases of "Start animating", by job progress (see the worker's generate job). */
const STEPS = [
  { id: "plan", from: 0, label: "Understanding the story", hint: "Reading the subtitles, scenes and emotions", icon: ScanEye },
  { id: "build", from: 0.25, label: "Building the scenes", hint: "Characters, places and animation", icon: Clapperboard },
  { id: "review", from: 0.7, label: "Checking its work", hint: "Looking at every shot and fixing problems", icon: Wand2 },
  { id: "sound", from: 0.87, label: "Sound effects and music", hint: "Placed under your voice", icon: Music },
] as const;

type Summary =
  | { exists: false }
  | { exists: true; complete: boolean; phase: "plan" | "build" | "review" | "sound" | "done"; components: { done: number; total: number }; sounds: number; updatedAt: string };

/**
 * Over the preview: "Start animating" when the voice is on the timeline but
 * nothing is animated yet; "Continue animating" after a stop or failure
 * (nothing finished is redone); and, while Claude works, a small progress bar
 * in the corner (Details opens the steps) with Pause/Resume and Stop.
 * Generation runs in the background worker — reloading or closing the page
 * doesn't stop it; only Pause or Stop do.
 */
export function StartAnimating() {
  const { project, store, jobs, startJob, refreshJobs } = useEditorContext();
  const timeline = useEditor(store, (s) => s.timeline);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const job = isBusy(jobs, "agent.generate") ?? jobs.find((j) => j.type === "agent.generate" && j.status === "paused");
  const latest = jobs.find((j) => j.type === "agent.generate");

  // Refresh what's finished whenever the generation job moves on.
  const signal = `${latest?.id}:${latest?.status}:${job?.progressMessage ?? ""}`;
  useEffect(() => {
    let alive = true;
    api<Summary>(`/api/projects/${project.id}/generation`)
      .then((s) => alive && setSummary(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [project.id, signal]);

  const voice = timeline.clips.find((c) => c.src?.startsWith("input/voice."));
  const hasScenes = timeline.clips.some((c) => c.kind === "scene");
  const captions = timeline.clips.filter((c) => c.kind === "caption").length;
  const unfinished = summary?.exists && !summary.complete;
  const parts = summary?.exists && summary.components.total ? `${summary.components.done} of ${summary.components.total} parts built` : null;

  async function start(mode: "continue" | "restart") {
    setStarting(true);
    const started = await startJob("agent.generate", { notes: notes.trim(), mode });
    setStarting(false);
    if (started) {
      setShowNotes(false);
      setConfirmRestart(false);
    }
  }

  // ---- Working (or paused) --------------------------------------------------
  // A small bar in the corner of the preview, so the preview stays usable;
  // "Details" opens the step-by-step progress.
  if (job) {
    const paused = job.status === "paused";
    const pausing = job.status === "running" && job.pauseRequested;
    const progress = job.status === "pending" && !job.progress ? 0 : job.progress;
    const current = [...STEPS].reverse().find((s) => progress >= s.from) ?? STEPS[0];
    const act = async (action: "pause" | "resume" | "stop") => {
      setActing(true);
      try {
        if (action === "stop") await api(`/api/jobs/${job.id}`, { method: "DELETE" });
        else await api(`/api/jobs/${job.id}`, { method: "PATCH", json: { action } });
        await refreshJobs();
        if (action === "stop") toast.message("Animation stopped", { description: "Everything finished is kept — Continue animating picks up where it left off.", duration: 10000 });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "That didn't work.");
      } finally {
        setActing(false);
      }
    };
    const status = paused ? "Paused" : pausing ? "Pausing…" : job.status === "pending" ? "Starting…" : current.label;
    const controls = (
      <div className="flex shrink-0 items-center gap-0.5">
        {paused ? (
          <Button size="icon-xs" variant="ghost" title="Resume" aria-label="Resume" disabled={acting} onClick={() => void act("resume")}>
            <Play />
          </Button>
        ) : (
          <Button size="icon-xs" variant="ghost" title="Pause" aria-label="Pause" disabled={acting || pausing} onClick={() => void act("pause")}>
            <Pause />
          </Button>
        )}
        <Button size="icon-xs" variant="ghost" title="Stop" aria-label="Stop" disabled={acting} onClick={() => void act("stop")}>
          <Square />
        </Button>
      </div>
    );
    const bar = (
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all duration-700", paused ? "bg-muted-foreground/60" : "bg-brand")} style={{ width: `${Math.max(3, progress * 100)}%` }} />
      </div>
    );

    if (!detailsOpen) {
      return (
        <div className="pointer-events-none absolute inset-x-0 bottom-14 z-30 flex justify-end p-3">
          <div className="pointer-events-auto w-72 space-y-2 rounded-xl border bg-popover/95 px-3 py-2.5 shadow-xl backdrop-blur">
            <div className="flex items-center gap-2">
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", paused ? "bg-muted text-muted-foreground" : "bg-brand text-brand-foreground")}>
                {paused ? <Pause className="size-3.5" /> : <Loader2 className="size-3.5 animate-spin" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold" title={status}>
                  {status}
                </p>
                <p className="text-[11px] text-muted-foreground">{Math.round(progress * 100)}% animated</p>
              </div>
              {controls}
            </div>
            {bar}
            <button className="flex w-full items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setDetailsOpen(true)}>
              <ChevronUp className="size-3" /> Details
            </button>
          </div>
        </div>
      );
    }

    return (
      <Panel docked>
        <div className="flex items-center gap-3">
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", paused ? "bg-muted text-muted-foreground" : "bg-brand text-brand-foreground")}>
            {paused ? <Pause className="size-4.5" /> : <Sparkles className="size-4.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{paused ? "Animation paused" : "Claude is animating your story"}</p>
            <p className="text-xs text-muted-foreground">
              {paused ? "Nothing finished is lost. Resume to carry on." : "Keeps going if you reload or close this page."}
              {hasScenes ? " Finished shots are already on the timeline." : ""}
            </p>
          </div>
          <Button size="icon-xs" variant="ghost" title="Hide details" aria-label="Hide details" onClick={() => setDetailsOpen(false)}>
            <ChevronDown />
          </Button>
        </div>
        <ol className="space-y-2">
          {STEPS.map((s, i) => {
            const next = STEPS[i + 1]?.from ?? 1.01;
            const state = progress >= next ? "done" : s === current ? (paused ? "held" : "now") : "later";
            const Icon = s.icon;
            const detail = state === "now" ? job.progressMessage || s.hint : state === "held" ? "Paused here" : s.id === "build" && parts && state !== "later" ? parts : s.hint;
            return (
              <li key={s.id} className={cn("flex items-start gap-3", state === "later" && "opacity-45")}>
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full",
                    state === "done"
                      ? "bg-brand text-brand-foreground"
                      : state === "now" || state === "held"
                        ? "bg-brand-soft text-brand ring-1 ring-brand/50"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {state === "done" ? (
                    <Check className="size-3.5" />
                  ) : state === "now" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : state === "held" ? (
                    <Pause className="size-3" />
                  ) : (
                    <Icon className="size-3" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm", (state === "now" || state === "held") && "font-semibold")}>{s.label}</p>
                  <p className="truncate text-xs text-muted-foreground" title={detail}>
                    {detail}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="space-y-1.5">
          {bar}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {pausing ? "Pausing… · " : ""}
              {Math.round(progress * 100)}%{parts && current.id === "build" ? ` · ${parts}` : ""}
            </span>
            {controls}
          </div>
        </div>
      </Panel>
    );
  }

  if (!voice) return null;

  // ---- Stopped or failed part-way: continue -------------------------------
  if (unfinished && summary?.exists) {
    const step = STEPS.find((s) => s.id === summary.phase) ?? STEPS[0];
    return (
      <Panel docked={hasScenes}>
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wider text-brand uppercase">Animation stopped</p>
          <p className="text-sm text-muted-foreground">
            Picks up at <span className="font-medium text-foreground">{step.label}</span>
            {summary.phase === "build" && parts ? ` — ${parts}` : ""}. Nothing that’s finished is done again.
          </p>
        </div>
        <Button size="lg" onClick={() => void start("continue")} disabled={starting} className="h-12 w-full gap-2 rounded-xl text-base font-semibold shadow-[0_0_40px_-8px] shadow-brand/60">
          {starting ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />} Continue animating
        </Button>
        {confirmRestart ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-destructive-soft p-2 text-xs">
            <span>This throws away the plan and scenes made so far.</span>
            <span className="flex shrink-0 gap-1">
              <Button size="xs" variant="ghost" onClick={() => setConfirmRestart(false)}>
                Keep
              </Button>
              <Button size="xs" variant="destructive" onClick={() => void start("restart")} disabled={starting}>
                Start over
              </Button>
            </span>
          </div>
        ) : (
          <button className="mx-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setConfirmRestart(true)}>
            <RotateCcw className="size-3" /> Start over instead
          </button>
        )}
      </Panel>
    );
  }

  if (hasScenes) return null;

  // ---- Not started yet ----------------------------------------------------
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-surface/85 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-5 text-center">
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wider text-brand uppercase">Your voice is on the timeline</p>
          <h2 className="text-2xl font-semibold">Ready to animate</h2>
          <p className="text-sm text-muted-foreground">
            Claude reads your subtitles to understand the story, the scenes and every emotion, then animates it to your {formatClock(voice.duration)} voiceover
            {captions ? ` (${captions} lines)` : ""}.
          </p>
        </div>
        <Button
          size="lg"
          onClick={() => void start("continue")}
          disabled={starting}
          className="h-14 w-full gap-2 rounded-xl text-lg font-semibold shadow-[0_0_40px_-8px] shadow-brand/60"
        >
          {starting ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />} Start animating
        </Button>
        {showNotes ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Anything Claude should know? e.g. “Emon is 24, wears a blue shirt; keep it hopeful at the end.”"
            className="w-full rounded-lg border bg-background p-3 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
          />
        ) : (
          <button className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={() => setShowNotes(true)}>
            Add directions for Claude (optional)
          </button>
        )}
      </div>
    </div>
  );
}

/** Centred over an empty preview; docked in the corner once shots exist, so they stay watchable. */
function Panel({ docked, children }: { docked: boolean; children: React.ReactNode }) {
  if (docked) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-14 z-30 flex justify-end p-3">
        <div className="pointer-events-auto w-80 space-y-4 rounded-2xl border bg-popover/95 p-4 shadow-2xl backdrop-blur">{children}</div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-surface/85 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-5 rounded-2xl border bg-popover/95 p-6 shadow-2xl backdrop-blur">{children}</div>
    </div>
  );
}
