"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Job, MediaAsset, Project, StoredScript, StoredTimeline } from "@studio/database";
import { deleteClips, splitClip, type Script } from "@studio/timeline";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api-client";
import { EditorContext, type EditorContextValue } from "./context";
import { AssistantPanel } from "./panels/assistant-panel";
import { ClipInspector } from "./panels/clip-inspector";
import { MediaPanel } from "./panels/media-panel";
import { ScriptPanel } from "./panels/script-panel";
import { Preview } from "./preview";
import { EditorStore, PlayheadStore, useEditor } from "./store";
import { TimelineView } from "./timeline/timeline";
import { TopBar } from "./top-bar";

interface Status {
  timelineRevision: number;
  scriptRevision: number;
  media: string;
  chat: string;
  jobs: Job[];
}

export function Editor(props: {
  project: Project;
  initialTimeline: StoredTimeline;
  initialScript: StoredScript;
  initialMedia: MediaAsset[];
  initialJobs: Job[];
}) {
  const { project } = props;
  const [store] = useState(
    () => new EditorStore(project.id, props.initialTimeline.timeline, props.initialTimeline.revision, (m) => toast.error(m)),
  );
  const [playhead] = useState(() => new PlayheadStore());
  const [media, setMedia] = useState(props.initialMedia);
  const [jobs, setJobs] = useState(props.initialJobs);
  const [script, setScript] = useState(props.initialScript);
  const [leftTab, setLeftTab] = useState<"script" | "media" | "clip">(props.initialScript.script.scenes.length ? "script" : "script");
  const [chatVersion, setChatVersion] = useState("");
  const lastStatus = useRef<Status | null>(null);
  const scriptSaving = useRef(false);
  const scriptRevision = useRef(props.initialScript.revision);

  const mediaById = useMemo(() => new Map(media.map((m) => [m.id, m])), [media]);

  // ---- Data refreshers ------------------------------------------------------
  const refreshMedia = useCallback(async () => {
    const { media } = await api<{ media: MediaAsset[] }>(`/api/projects/${project.id}/media`);
    setMedia(media);
  }, [project.id]);

  const refreshScript = useCallback(async () => {
    const s = await api<StoredScript>(`/api/projects/${project.id}/script`);
    scriptRevision.current = s.revision;
    setScript(s);
  }, [project.id]);

  const refreshJobs = useCallback(async () => {
    const { jobs } = await api<{ jobs: Job[] }>(`/api/projects/${project.id}/jobs`);
    setJobs(jobs);
  }, [project.id]);

  const reloadTimeline = useCallback(async () => {
    const t = await api<StoredTimeline>(`/api/projects/${project.id}/timeline`);
    store.load(t.timeline, t.revision);
  }, [project.id, store]);

  const saveScript = useCallback(
    async (next: Script) => {
      setScript((s) => ({ ...s, script: next }));
      scriptSaving.current = true;
      try {
        const saved = await api<StoredScript>(`/api/projects/${project.id}/script`, {
          method: "PUT",
          json: { script: next, baseRevision: scriptRevision.current },
        });
        scriptRevision.current = saved.revision;
        setScript(saved);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The script couldn't be saved.");
        await refreshScript();
      } finally {
        scriptSaving.current = false;
      }
    },
    [project.id, refreshScript],
  );

  // ---- Polling for outside changes (AI agents, background tasks) ----------
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
        setChatVersion(status.chat);
        const editor = store.getSnapshot();
        if (status.timelineRevision > editor.revision && !editor.dirty && !editor.saving && !editor.draft) await reloadTimeline();
        if (status.scriptRevision > scriptRevision.current && !scriptSaving.current) await refreshScript();
        if (!prev || prev.media !== status.media) await refreshMedia();
        // A task just finished: tell the user.
        for (const job of status.jobs) {
          const before = prev?.jobs.find((j) => j.id === job.id);
          if (before && before.status !== job.status) {
            if (job.status === "completed" && job.type !== "assistant.turn" && job.type !== "media.process") toast.success(`${job.title} — done.`);
            if (job.status === "failed") toast.error(job.error?.userMessage ?? `${job.title} failed.`);
          }
        }
      } catch {
        // Temporary network/database hiccup — try again next tick.
      }
      const active = lastStatus.current?.jobs.some((j) => j.status === "pending" || j.status === "running");
      timer = setTimeout(tick, active ? 1500 : 4000);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [project.id, store, reloadTimeline, refreshScript, refreshMedia]);

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
    async (files: File[], extra: { role?: string; sceneId?: string; shotId?: string } = {}) => {
      for (const file of files) {
        const id = toast.loading(`Uploading ${file.name}…`);
        try {
          const params = new URLSearchParams({ name: file.name, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v)) });
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

  const inspect = useCallback(
    (clipId: string) => {
      store.select([clipId]);
      setLeftTab("clip");
    },
    [store],
  );

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
    jobs,
    script,
    saveScript,
    refreshMedia,
    refreshScript,
    refreshJobs,
    startJob,
    upload,
    inspect,
    setLeftTab,
  };

  return (
    <EditorContext.Provider value={value}>
      <div className="flex h-full min-h-0 flex-col">
        <TopBar onReload={reloadTimeline} />
        <ConflictBanner store={store} onReload={reloadTimeline} />
        <div className="flex min-h-0 flex-1">
          <Tabs value={leftTab} onValueChange={(v) => setLeftTab(v as typeof leftTab)} className="flex w-[360px] shrink-0 flex-col gap-0 border-r">
            <TabsList className="m-2 grid grid-cols-3">
              <TabsTrigger value="script">Script</TabsTrigger>
              <TabsTrigger value="media">Media</TabsTrigger>
              <TabsTrigger value="clip">Clip</TabsTrigger>
            </TabsList>
            <TabsContent value="script" className="min-h-0 flex-1 overflow-y-auto">
              <ScriptPanel />
            </TabsContent>
            <TabsContent value="media" className="min-h-0 flex-1 overflow-y-auto">
              <MediaPanel />
            </TabsContent>
            <TabsContent value="clip" className="min-h-0 flex-1 overflow-y-auto">
              <ClipInspector />
            </TabsContent>
          </Tabs>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1">
              <Preview />
              <AssistantPanel chatVersion={chatVersion} />
            </div>
            <TimelineView />
          </div>
        </div>
      </div>
    </EditorContext.Provider>
  );
}

function ConflictBanner({ store, onReload }: { store: EditorStore; onReload: () => Promise<void> }) {
  const conflict = useEditor(store, (s) => s.conflict);
  if (!conflict) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-warning-soft px-4 py-2 text-sm">
      <span className="flex-1">The timeline was changed elsewhere (the AI assistant or another tab) while you were editing.</span>
      <button className="font-medium underline" onClick={() => void onReload()}>
        Load the latest version
      </button>
      <button className="font-medium underline" onClick={() => void store.save(true)}>
        Keep my changes
      </button>
    </div>
  );
}
