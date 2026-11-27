"use client";

import { useEffect, useState } from "react";
import { Check, Clapperboard, Loader2, Music, RotateCcw, ScanEye, Sparkles, Wand2, X } from "lucide-react";
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
 * (nothing finished is redone); and the live progress while Claude works.
 * Generation runs in the background worker — reloading or closing the page
 * doesn't stop it; only Stop does.
 */
export function StartAnimating() {
  const { project, store, jobs, startJob, refreshJobs } = useEditorContext();
  const timeline = useEditor(store, (s) => s.timeline);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const job = isBusy(jobs, "agent.generate");
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

  // ---- Working --------------------------------------------------------------
  if (job) {
    const progress = job.status === "pending" ? 0 : job.progress;
    const current = [...STEPS].reverse().find((s) => progress >= s.from) ?? STEPS[0];
    const stop = async () => {
      try {
        await api(`/api/jobs/${job.id}`, { method: "DELETE" });
        await refreshJobs();
        toast.message("Stopped. Everything finished so far is kept — press Continue animating to pick up where it left off.", { duration: 10000 });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't stop.");
      }
    };
    return (
      <Panel docked={hasScenes}>
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground">
            <Sparkles className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Claude is animating your story</p>
            <p className="text-xs text-muted-foreground">
              Keeps going if you reload or close this page{hasScenes ? " · finished shots are already on the timeline" : ""}.
            </p>
          </div>
        </div>
        <ol className="space-y-2">
          {STEPS.map((s, i) => {
            const next = STEPS[i + 1]?.from ?? 1.01;
            const state = progress >= next ? "done" : s === current ? "now" : "later";
            const Icon = s.icon;
            const detail = state === "now" ? job.progressMessage || s.hint : s.id === "build" && parts && state !== "later" ? parts : s.hint;
            return (
              <li key={s.id} className={cn("flex items-start gap-3", state === "later" && "opacity-45")}>
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full",
                    state === "done" ? "bg-brand text-brand-foreground" : state === "now" ? "bg-brand-soft text-brand ring-1 ring-brand/50" : "bg-muted text-muted-foreground",
                  )}
                >
                  {state === "done" ? <Check className="size-3.5" /> : state === "now" ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm", state === "now" && "font-semibold")}>{s.label}</p>
                  <p className="truncate text-xs text-muted-foreground" title={detail}>
                    {detail}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="space-y-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${Math.max(3, progress * 100)}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {Math.round(progress * 100)}%{parts && current.id === "build" ? ` · ${parts}` : ""}
            </span>
            <button className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground" onClick={() => void stop()}>
              <X className="size-3" /> Stop
            </button>
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
          <p className="text-xs font-medium tracking-wider text-brand uppercase">Animation paused</p>
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
