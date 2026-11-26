"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, CloudOff, ListChecks, Loader2, Redo2, RotateCcw, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { ASPECT_RATIOS, type AspectRatio } from "@studio/shared";
import type { Job } from "@studio/database";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";
import { useEditorContext } from "./context";
import { RenderDialog } from "./render-dialog";
import { useEditor } from "./store";

export function TopBar({ onReload }: { onReload: () => Promise<void> }) {
  const { project, store } = useEditorContext();
  const router = useRouter();
  const canUndo = useEditor(store, (s) => s.canUndo);
  const canRedo = useEditor(store, (s) => s.canRedo);
  const [title, setTitle] = useState(project.title);
  const [aspect, setAspect] = useState<AspectRatio>(project.aspectRatio);

  async function rename() {
    const next = title.trim();
    if (!next || next === project.title) return setTitle(project.title);
    try {
      await api(`/api/projects/${project.id}`, { method: "PATCH", json: { title: next } });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't rename.");
      setTitle(project.title);
    }
  }

  async function changeAspect(value: AspectRatio) {
    setAspect(value);
    try {
      await store.save();
      await api(`/api/projects/${project.id}`, { method: "PATCH", json: { aspectRatio: value } });
      await onReload();
      toast.success(`Video shape changed to ${value}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't change the video shape.");
      setAspect(project.aspectRatio);
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={rename}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="min-w-0 flex-1 truncate rounded-md bg-transparent px-2 py-1 text-base font-semibold hover:bg-surface focus:bg-surface focus:outline-none"
        aria-label="Documentary title"
      />
      <SaveStatus />
      <div className="mx-1 h-6 w-px bg-border" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" onClick={store.undo} disabled={!canUndo} aria-label="Undo">
            <Undo2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" onClick={store.redo} disabled={!canRedo} aria-label="Redo">
            <Redo2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
      </Tooltip>
      <Select value={aspect} onValueChange={(v) => void changeAspect(v as AspectRatio)}>
        <SelectTrigger size="sm" className="w-24" aria-label="Video shape">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ASPECT_RATIOS.map((r) => (
            <SelectItem key={r} value={r}>
              {r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <TasksMenu />
      <RenderDialog />
    </header>
  );
}

function SaveStatus() {
  const { store } = useEditorContext();
  const { dirty, saving, saveError } = useEditor(store, (s) => s);
  if (saveError)
    return (
      <span className="flex items-center gap-1 text-xs text-destructive" title={saveError}>
        <CloudOff className="size-3.5" /> Not saved — retrying
      </span>
    );
  if (saving || dirty)
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Saving…
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Check className="size-3.5" /> Saved
    </span>
  );
}

function TasksMenu() {
  const { jobs, refreshJobs } = useEditorContext();
  const visible = jobs.filter((j) => j.type !== "media.process" || j.status !== "completed").slice(0, 12);
  const active = jobs.filter((j) => j.status === "pending" || j.status === "running");

  async function act(job: Job, action: "retry" | "cancel") {
    try {
      await api(`/api/jobs/${job.id}`, { method: action === "retry" ? "POST" : "DELETE" });
      await refreshJobs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work.");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Background tasks">
          {active.length ? <Loader2 className="animate-spin" /> : <ListChecks />}
          {active.length ? `${active.length} working` : "Tasks"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="border-b px-3 py-2 text-sm font-medium">Background tasks</div>
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing running. Generation and rendering tasks appear here.</p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {visible.map((job) => (
              <li key={job.id} className="space-y-1.5 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{job.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(job.updatedAt)}</span>
                </div>
                {job.status === "running" || job.status === "pending" ? (
                  <>
                    <Progress value={job.status === "pending" ? 0 : job.progress * 100} className="h-1.5" />
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{job.status === "pending" ? "Waiting to start…" : job.progressMessage || "Working…"}</span>
                      <button className="flex shrink-0 items-center gap-1 hover:text-foreground" onClick={() => void act(job, "cancel")}>
                        <X className="size-3" /> Cancel
                      </button>
                    </div>
                  </>
                ) : job.status === "failed" ? (
                  <div className="flex items-start justify-between gap-2 text-xs">
                    <span className="flex gap-1 text-destructive">
                      <AlertCircle className="mt-0.5 size-3 shrink-0" /> {job.error?.userMessage ?? "Failed"}
                    </span>
                    <button className="flex shrink-0 items-center gap-1 font-medium hover:underline" onClick={() => void act(job, "retry")}>
                      <RotateCcw className="size-3" /> Retry
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">{job.status === "completed" ? "Done" : "Cancelled"}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          Tasks run in the background worker (<code>npm run dev:worker</code>). If they stay “waiting”, make sure it’s running.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
