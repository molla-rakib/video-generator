"use client";

import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { formatClock, type Clip } from "@studio/timeline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { isBusy, useEditorContext } from "./context";
import { useEditor } from "./store";

/** Ideas shown under the request box, depending on what's selected. */
function suggestionsFor(clips: Clip[], hasRange: boolean): string[] {
  const kinds = new Set(clips.map((c) => c.kind));
  if (kinds.has("scene")) return ["Make it night", "Add a cat walking past", "Make the character look sad", "Slower camera, more dramatic"];
  if (kinds.has("audio")) return ["Make this quieter", "Fade it out smoothly", "Remove the sound here", "Start it half a second later"];
  if (kinds.has("caption")) return ["Fix the spelling", "Split this into two lines", "Make the captions bigger"];
  if (hasRange) return ["Make this part more dramatic", "Add rain to this part", "Make the music stop here"];
  return ["Make the whole video brighter", "Use the same character colours everywhere", "Make the shots flow better"];
}

export function AskClaudeButton() {
  const { store, jobs, startJob } = useEditorContext();
  const timeline = useEditor(store, (s) => s.timeline);
  const selected = useEditor(store, (s) => s.selected);
  const range = useEditor(store, (s) => s.range);
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState("");
  const working = isBusy(jobs, "agent.revise", "agent.generate");

  const clips = selected.map((id) => timeline.clips.find((c) => c.id === id)).filter((c): c is Clip => Boolean(c));
  const target =
    clips.length && range
      ? `${clips.length} clip${clips.length === 1 ? "" : "s"} and ${formatClock(range.start)}–${formatClock(range.end)}`
      : clips.length === 1
        ? `“${clips[0]!.label || clips[0]!.text || clips[0]!.kind}”`
        : clips.length
          ? `${clips.length} clips`
          : range
            ? `${formatClock(range.start)} – ${formatClock(range.end)}`
            : "the whole video";

  async function send() {
    const text = request.trim();
    if (text.length < 2) return toast.error("Tell Claude what to change.");
    const job = await startJob("agent.revise", { request: text, clipIds: selected, range });
    if (job) {
      setOpen(false);
      setRequest("");
      toast.message("Claude is on it. You'll see the change here when it's done.");
    }
  }

  return (
    <>
      <Button
        size="sm"
        className="gap-1.5 bg-brand font-semibold text-brand-foreground shadow-sm hover:bg-brand/90"
        onClick={() => setOpen(true)}
        disabled={Boolean(working)}
        title="Select clips or drag across the timeline to pick a part, then describe the change"
      >
        {working ? <Loader2 className="animate-spin" /> : <Sparkles />} {working ? "Claude is working…" : "Ask Claude"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-brand text-brand-foreground">
                <Sparkles className="size-4" />
              </span>
              Ask Claude to change {target}
            </DialogTitle>
            <DialogDescription>
              Claude changes only what you selected. You can undo it afterwards.
              {!clips.length && !range ? " Tip: select clips, or drag across an empty part of the timeline to pick a moment." : ""}
            </DialogDescription>
          </DialogHeader>
          {clips.length ? (
            <div className="flex flex-wrap gap-1.5">
              {clips.slice(0, 8).map((c) => (
                <span key={c.id} className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand ring-1 ring-brand/30 ring-inset">
                  {c.label || c.text || c.kind}
                </span>
              ))}
              {clips.length > 8 ? <span className="text-xs text-muted-foreground">+{clips.length - 8} more</span> : null}
            </div>
          ) : null}
          <Textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
            }}
            rows={4}
            autoFocus
            placeholder="What should change? e.g. “Make this scene night and add a lit lamp post”"
            className="text-base"
          />
          <div className="flex flex-wrap gap-1.5">
            {suggestionsFor(clips, Boolean(range)).map((s) => (
              <button key={s} type="button" onClick={() => setRequest(s)} className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:border-brand/50 hover:bg-brand-soft hover:text-brand">
                {s}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void send()}>
              <Sparkles /> Ask Claude
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A slim bar under the top bar while Claude is changing the video. */
export function ClaudeStatusBar() {
  const { jobs, refreshJobs } = useEditorContext();
  const job = isBusy(jobs, "agent.revise");
  if (!job) return null;
  async function cancel() {
    try {
      await api(`/api/jobs/${job!.id}`, { method: "DELETE" });
      await refreshJobs();
      toast.message("Stopped. Your video is unchanged.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't stop Claude.");
    }
  }
  return (
    <div className="flex items-center gap-3 border-b border-brand/30 bg-brand-soft px-4 py-1.5 text-sm text-foreground">
      <Loader2 className="size-4 shrink-0 animate-spin text-brand" />
      <span className="shrink-0 font-medium">{job.title}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{job.status === "pending" ? "Starting…" : job.progressMessage || "Working…"}</span>
      <span className="hidden text-xs text-muted-foreground md:inline">Edits you make now may be replaced when Claude finishes.</span>
      <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-white/10" onClick={() => void cancel()}>
        <X className="size-3" /> Stop
      </button>
    </div>
  );
}
