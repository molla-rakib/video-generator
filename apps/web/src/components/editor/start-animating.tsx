"use client";

import { useState } from "react";
import { Check, Clapperboard, Loader2, Music, ScanEye, Sparkles, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { formatClock } from "@studio/timeline";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { isBusy, useEditorContext } from "./context";
import { useEditor } from "./store";

/** The phases of "Start animating", by job progress (see the worker's generate job). */
const STEPS = [
  { from: 0, label: "Understanding the story", hint: "Reading the subtitles, scenes and emotions", icon: ScanEye },
  { from: 0.25, label: "Building the scenes", hint: "Characters, places and animation", icon: Clapperboard },
  { from: 0.7, label: "Checking its work", hint: "Looking at every shot and fixing problems", icon: Wand2 },
  { from: 0.87, label: "Sound effects and music", hint: "Placed under your voice", icon: Music },
] as const;

/**
 * Over the preview: the big "Start animating" call to action when the voice
 * is on the timeline but nothing is animated yet — and the progress of the
 * animation while Claude works.
 */
export function StartAnimating() {
  const { store, jobs, startJob, refreshJobs } = useEditorContext();
  const timeline = useEditor(store, (s) => s.timeline);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [starting, setStarting] = useState(false);
  const job = isBusy(jobs, "agent.generate");

  const voice = timeline.clips.find((c) => c.src?.startsWith("input/voice."));
  const hasScenes = timeline.clips.some((c) => c.kind === "scene");
  const captions = timeline.clips.filter((c) => c.kind === "caption").length;

  if (job) {
    const progress = job.status === "pending" ? 0 : job.progress;
    const current = [...STEPS].reverse().find((s) => progress >= s.from) ?? STEPS[0];
    const stop = async () => {
      try {
        await api(`/api/jobs/${job.id}`, { method: "DELETE" });
        await refreshJobs();
        toast.message("Stopped. Your project is back to how it was.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't stop.");
      }
    };
    return (
      <Overlay>
        <div className="w-full max-w-md space-y-5 rounded-2xl border bg-popover/95 p-6 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-brand-foreground">
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Claude is animating your story</p>
              <p className="text-xs text-muted-foreground">This takes a while — you can leave this page open or come back later.</p>
            </div>
          </div>
          <ol className="space-y-2.5">
            {STEPS.map((s, i) => {
              const next = STEPS[i + 1]?.from ?? 1.01;
              const state = progress >= next ? "done" : s === current ? "now" : "later";
              const Icon = s.icon;
              return (
                <li key={s.label} className={cn("flex items-start gap-3", state === "later" && "opacity-45")}>
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full",
                      state === "done" ? "bg-brand text-brand-foreground" : state === "now" ? "bg-brand-soft text-brand ring-1 ring-brand/50" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {state === "done" ? <Check className="size-4" /> : state === "now" ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", state === "now" && "font-semibold")}>{s.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{state === "now" && job.progressMessage ? job.progressMessage : s.hint}</p>
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
              <span>{Math.round(progress * 100)}%</span>
              <button className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground" onClick={() => void stop()}>
                <X className="size-3" /> Stop
              </button>
            </div>
          </div>
        </div>
      </Overlay>
    );
  }

  if (!voice || hasScenes) return null;

  async function start() {
    setStarting(true);
    const started = await startJob("agent.generate", { notes: notes.trim() });
    setStarting(false);
    if (started) setShowNotes(false);
  }

  return (
    <Overlay>
      <div className="w-full max-w-md space-y-5 text-center">
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wider text-brand uppercase">Your voice is on the timeline</p>
          <h2 className="text-2xl font-semibold">Ready to animate</h2>
          <p className="text-sm text-muted-foreground">
            Claude reads your subtitles to understand the story, the scenes and every emotion, then animates it to your{" "}
            {formatClock(voice.duration)} voiceover{captions ? ` (${captions} lines)` : ""}.
          </p>
        </div>
        <Button
          size="lg"
          onClick={() => void start()}
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
    </Overlay>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 z-30 flex items-center justify-center bg-surface/85 p-6 backdrop-blur-sm">{children}</div>;
}
