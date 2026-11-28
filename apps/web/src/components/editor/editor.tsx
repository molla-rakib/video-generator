"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Job, MediaAsset, Project, StoredTimeline } from "@studio/database";
import { deleteClips, splitClip } from "@studio/timeline";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { EditorContext, type EditorContextValue } from "./context";
import { ClaudeStatusBar } from "./ask-claude";
import { ClipInspector } from "./panels/clip-inspector";
import { MediaPanel } from "./panels/media-panel";
import { Preview } from "./preview";
import { EditorStore, PlayheadStore, useEditor } from "./store";
import { TimelineView } from "./timeline/timeline";
import { TopBar } from "./top-bar";

interface Status {
  fingerprint: string;
  media: string;
  jobs: Job[];
  files: Record<string, string | null>;
}

export function Editor(props: {
  project: Project;
  initialTimeline: StoredTimeline;
  initialMedia: MediaAsset[];
  initialJobs: Job[];
}) {
  const { project } = props;
  const [store] = useState(
    () => new EditorStore(project.id, props.initialTimeline.timeline, props.initialTimeline.fingerprint, (m) => toast.error(m)),
  );
  const [playhead] = useState(() => new PlayheadStore());
  const [media, setMedia] = useState(props.initialMedia);
  const [jobs, setJobs] = useState(props.initialJobs);
  const [fileVersions, setFileVersions] = useState<Record<string, string | null>>({});
  const lastStatus = useRef<Status | null>(null);

  const mediaById = useMemo(() => new Map(media.map((m) => [m.id, m])), [media]);
  const mediaByPath = useMemo(() => new Map(media.filter((m) => m.kind !== "render").map((m) => [m.path, m])), [media]);

  // ---- Data refreshers ------------------------------------------------------
  const refreshMedia = useCallback(async () => {
    const { media } = await api<{ media: MediaAsset[] }>(`/api/projects/${project.id}/media`);
    setMedia(media);
  }, [project.id]);

  const refreshJobs = useCallback(async () => {
    const { jobs } = await api<{ jobs: Job[] }>(`/api/projects/${project.id}/jobs`);
    setJobs(jobs);
  }, [project.id]);

  const reloadTimeline = useCallback(async () => {
    const t = await api<StoredTimeline>(`/api/projects/${project.id}/timeline`);
    store.load(t.timeline, t.fingerprint);
  }, [project.id, store]);

  /** Claude finished: show what it changed, with a one-click undo. */
  const announceClaude = useCallback(
    (job: Job) => {
      const result = (job.result ?? {}) as { summary?: string; backup?: string };
      // The summary can be several paragraphs; the toast shows the first one (clamped).
      const lead = (result.summary ?? "").trim().split(/\n\s*\n/)[0]?.trim();
      toast.success(job.type === "agent.generate" ? "Animation finished" : "Claude finished the change", {
        description: lead || undefined,
        duration: 15000,
        action: result.backup
          ? {
              label: "Undo",
              onClick: () => {
                api(`/api/projects/${project.id}/history/restore`, { method: "POST", json: { backup: result.backup } })
                  .then(() => reloadTimeline())
                  .then(() => toast.message("Claude's change was undone."))
                  .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Couldn't undo."));
              },
            }
          : undefined,
      });
    },
    [project.id, reloadTimeline],
  );

  // ---- Polling for outside changes (agent edits, background tasks) --------
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const status = await api<Status>(`/api/projects/${project.id}/status`);
        if (stopped) return;
        const prev = lastStatus.current;
        lastStatus.current = status;
        setJobs(status.jobs);
        setFileVersions((current) => (JSON.stringify(current) === JSON.stringify(status.files) ? current : status.files));
        const editor = store.getSnapshot();
        if (status.fingerprint !== editor.fingerprint && !editor.dirty && !editor.saving && !editor.draft) await reloadTimeline();
        if (!prev || prev.media !== status.media) await refreshMedia();
        // A task just finished: tell the user.
        for (const job of status.jobs) {
          const before = prev?.jobs.find((j) => j.id === job.id);
          if (before && before.status !== job.status) {
            if (job.status === "completed" && (job.type === "agent.revise" || job.type === "agent.generate")) announceClaude(job);
            else if (job.status === "completed" && job.type !== "media.process") toast.success(`${job.title} — done.`);
            if (job.status === "failed") toast.error(job.error?.userMessage ?? `${job.title} failed.`);
          }
        }
      } catch {
        // Temporary network/database hiccup — try again next tick.
      }
      const active = lastStatus.current?.jobs.some((j) => j.status === "pending" || j.status === "running");
      timer = setTimeout(tick, active ? 1500 : 3000);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [project.id, store, reloadTimeline, refreshMedia, announceClaude]);

  // Save before leaving the page.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (store.getSnapshot().dirty) {
        void store.save();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [store]);

  const startJob = useCallback(
    async (type: string, input: Record<string, unknown> = {}) => {
      try {
        await store.save();
        const { job } = await api<{ job: Job }>(`/api/projects/${project.id}/jobs`, { method: "POST", json: { type, input } });
        setJobs((j) => [job, ...j]);
        return job;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "That couldn't be started.");
        return null;
      }
    },
    [project.id, store],
  );

  const upload = useCallback(
    async (files: File[], extra: { role?: string } = {}) => {
      for (const file of files) {
        const id = toast.loading(`Uploading ${file.name}…`);
        try {
          const params = new URLSearchParams({ name: file.name, ...(extra.role ? { role: extra.role } : {}) });
          await api(`/api/projects/${project.id}/media?${params}`, {
            method: "POST",
            body: file,
            headers: { "Content-Type": file.type || "application/octet-stream" },
          });
          toast.success(`${file.name} uploaded — preparing it now.`, { id });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : `${file.name} couldn't be uploaded.`, { id });
        }
      }
      await Promise.all([refreshMedia(), refreshJobs()]);
    },
    [project.id, refreshMedia, refreshJobs],
  );

  const inspect = useCallback((clipId: string) => store.select([clipId]), [store]);

  // ---- Keyboard shortcuts ---------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        store.redo();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void store.save();
      } else if (e.key === "Escape") {
        store.select([]);
        store.setRange(null);
      } else if (e.key === " ") {
        e.preventDefault();
        playhead.controls?.toggle();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        const ids = store.getSnapshot().selected;
        if (ids.length) {
          e.preventDefault();
          store.apply((t) => deleteClips(t, ids));
        }
      } else if (e.key.toLowerCase() === "s" && !mod) {
        const [id] = store.getSnapshot().selected;
        if (id) store.apply((t) => splitClip(t, id, playhead.time).timeline);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / store.getSnapshot().timeline.fps;
        playhead.seek(playhead.time + (e.key === "ArrowLeft" ? -step : step));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, playhead]);

  const value: EditorContextValue = {
    project,
    store,
    playhead,
    media,
    mediaById,
    mediaByPath,
    fileVersions,
    jobs,
    refreshMedia,
    refreshJobs,
    startJob,
    upload,
    inspect,
  };

  return (
    <EditorContext.Provider value={value}>
      <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <TopBar />
        <ConflictBanner store={store} onReload={reloadTimeline} />
        <ClaudeStatusBar />
        <div className="flex min-h-0 flex-1">
          <SidePanel title="Media" side="left">
            <MediaPanel />
          </SidePanel>
          <Preview />
          <SidePanel title="Clip settings" side="right">
            <ClipInspector />
          </SidePanel>
        </div>
        <TimelineView />
      </div>
    </EditorContext.Provider>
  );
}

function SidePanel({ title, side, children }: { title: string; side: "left" | "right"; children: React.ReactNode }) {
  return (
    <aside className={cn("flex w-[300px] shrink-0 flex-col bg-background xl:w-[330px]", side === "left" ? "border-r" : "border-l")} aria-label={title}>
      <h2 className="flex h-10 shrink-0 items-center border-b px-4 text-sm font-semibold">{title}</h2>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}

function ConflictBanner({ store, onReload }: { store: EditorStore; onReload: () => Promise<void> }) {
  const conflict = useEditor(store, (s) => s.conflict);
  if (!conflict) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-warning-soft px-4 py-2 text-sm">
      <span className="flex-1">The project was changed elsewhere (the AI agent, a background task or another tab) while you were editing.</span>
      <button className="font-medium underline" onClick={() => void onReload()}>
        Load the latest version
      </button>
      <button className="font-medium underline" onClick={() => void store.save(true)}>
        Keep my changes
      </button>
    </div>
  );
}
