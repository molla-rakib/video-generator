"use client";

import type { PlayerRef } from "@remotion/player";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { DocPlayer, DocThumb } from "@/app/_components/client-only";
import { ArrowLeftIcon, Logo, RATIO_OPTIONS, RatioIcon, UndoIcon } from "@/app/_components/ui";
import { loadProject, newProjectId, saveProject, type Project } from "@/lib/client/projects";
import type { DocSpec, Ratio } from "@/lib/spec/schema";
import { buildTimeline } from "@/lib/spec/timeline";
import { getLayout } from "@/remotion/layout";
import { EditPanel } from "./EditPanel";
import { ExportButton } from "./ExportButton";
import { ScriptPanel, SourcesPanel, StylePanel } from "./Panels";

type Tab = "edit" | "script" | "sources" | "style";

export function Studio() {
  const [project, setProject] = useState<Project | null>(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    return id ? loadProject(id) : null;
  });
  const [ratio, setRatio] = useState<Ratio>(project?.ratio ?? "16:9");
  const [tab, setTab] = useState<Tab>("edit");
  const [activeKey, setActiveKey] = useState<string | undefined>();
  /** Until the viewer plays or seeks, show the finished title as a poster. */
  const [started, setStarted] = useState(false);
  const frameRef = useRef(0);
  const playerRef = useRef<PlayerRef>(null);

  const spec = project?.spec;
  const timeline = useMemo(() => (spec ? buildTimeline(spec) : null), [spec]);
  const layout = getLayout(ratio);
  const inputProps = useMemo(() => (spec ? { spec, ratio } : null), [spec, ratio]);

  const onFrame = useCallback(
    (frame: number) => {
      frameRef.current = frame;
      if (frame > 0) setStarted(true);
      if (timeline) setActiveKey(timeline.segments.findLast((s) => s.from <= frame)?.key);
    },
    [timeline],
  );

  /** Replaces the video (keeping the old one for undo). Built-in samples are copied on first change. */
  const commit = useCallback((next: DocSpec, opts: { undoable?: boolean } = {}) => {
    setProject((p) => {
      if (!p) return p;
      const now = Date.now();
      const base = p.sample ? { ...p, id: newProjectId(), sample: false, createdAt: now } : p;
      const updated: Project = {
        ...base,
        spec: next,
        title: next.meta.title,
        ratio,
        updatedAt: now,
        history: opts.undoable === false ? base.history : [...base.history, p.spec],
      };
      saveProject(updated);
      if (p.sample) window.history.replaceState(null, "", `/studio?id=${updated.id}`);
      return updated;
    });
  }, [ratio]);

  const undo = () =>
    setProject((p) => {
      if (!p || !p.history.length) return p;
      const updated = { ...p, spec: p.history[p.history.length - 1], history: p.history.slice(0, -1), updatedAt: Date.now() };
      saveProject(updated);
      return updated;
    });

  if (!project || !spec || !timeline || !inputProps) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p className="text-lg text-zinc-300">This video couldn’t be found.</p>
          <p className="mt-1 text-sm text-zinc-500">Videos are saved in this browser — they won’t appear on other devices yet.</p>
          <Link href="/" className="mt-5 inline-block rounded-xl bg-white px-4 py-2 font-medium text-ink">
            Create a new video
          </Link>
        </div>
      </div>
    );
  }

  const scenes = timeline.segments.filter((s) => s.kind === "scene");
  const seek = (f: number) => playerRef.current?.seekTo(f);

  return (
    <div className="flex h-screen min-h-[640px] flex-col">
      {/* Top bar */}
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-3 sm:px-5">
        <Link href="/" className="rounded-xl p-2 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label="Back to create">
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
        <span className="hidden md:inline">
          <Logo small />
        </span>
        <span className="hidden h-6 w-px bg-white/10 md:inline" />
        <input
          aria-label="Video title"
          value={spec.meta.title}
          onChange={(e) => commit({ ...spec, meta: { ...spec.meta, title: e.target.value } }, { undoable: false })}
          className="min-w-0 flex-1 truncate rounded-lg bg-transparent px-2 py-1 font-display text-lg font-semibold hover:bg-white/5 focus:bg-white/5 focus:outline-none sm:max-w-sm"
        />
        {project.sample ? <span className="hidden rounded-full bg-white/5 px-2.5 py-1 text-xs text-zinc-400 ring-1 ring-white/10 sm:inline">Example · edits make a copy</span> : null}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={undo}
            disabled={!project.history.length}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 disabled:opacity-30"
            title="Undo last change"
          >
            <UndoIcon /> <span className="hidden sm:inline">Undo</span>
          </button>
          <ExportButton spec={spec} ratio={ratio} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Stage */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-center gap-1 px-4 pt-4">
            <div className="flex rounded-xl bg-white/5 p-1 ring-1 ring-white/10" role="radiogroup" aria-label="Aspect ratio">
              {RATIO_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  role="radio"
                  aria-checked={o.id === ratio}
                  title={o.hint}
                  onClick={() => setRatio(o.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${o.id === ratio ? "bg-white text-ink" : "text-zinc-400 hover:text-white"}`}
                >
                  <RatioIcon ratio={o.id} size={14} />
                  {o.label}
                  <span className={`hidden text-xs xl:inline ${o.id === ratio ? "text-zinc-500" : "text-zinc-600"}`}>{o.hint.split(" ")[0]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center p-4">
            <div
              className="relative w-full overflow-hidden rounded-2xl bg-black shadow-2xl shadow-black/60 ring-1 ring-white/10"
              style={{
                aspectRatio: `${layout.width} / ${layout.height}`,
                maxHeight: "100%",
                maxWidth: `min(100%, calc((100vh - 18rem) * ${layout.width / layout.height}))`,
              }}
            >
              <DocPlayer
                key={`${project.id}-${ratio}-${project.history.length}`}
                playerRef={playerRef}
                onFrame={onFrame}
                inputProps={inputProps}
                durationInFrames={timeline.durationInFrames}
                fps={timeline.fps}
                width={layout.width}
                height={layout.height}
                // eslint-disable-next-line react-hooks/refs -- read once on (re)mount to keep the playhead
                initialFrame={Math.min(frameRef.current, timeline.durationInFrames - 1)}
                posterFrame={started ? undefined : Math.min(75, timeline.durationInFrames - 1)}
              />
            </div>
          </div>

          {/* Scene strip */}
          <div className="shrink-0 border-t border-white/10 px-4 py-3">
            <ol className="flex gap-2 overflow-x-auto pb-1" aria-label="Scenes">
              {scenes.map((seg, i) => {
                if (seg.kind !== "scene") return null;
                const active = seg.key === activeKey;
                const thumbFrame = seg.from + seg.visibleStart + Math.min(75, Math.floor((seg.durationInFrames - seg.visibleStart) * 0.5));
                const thumbW = Math.round(64 * (layout.width / layout.height));
                return (
                  <li key={seg.key} className="shrink-0">
                    <button
                      onClick={() => seek(seg.from + seg.visibleStart)}
                      className={`group block rounded-xl p-1 text-left transition ${active ? "bg-brand/20 ring-2 ring-brand" : "hover:bg-white/5"}`}
                      title={seg.scene.narration}
                    >
                      <div className="overflow-hidden rounded-lg bg-black" style={{ width: Math.max(thumbW, 48), height: 64 }}>
                        <DocThumb inputProps={inputProps} frame={thumbFrame} durationInFrames={timeline.durationInFrames} fps={timeline.fps} width={layout.width} height={layout.height} />
                      </div>
                      <div className="mt-1 px-0.5 text-[11px] text-zinc-400">
                        {i + 1} · {Math.round((seg.durationInFrames - seg.visibleStart) / timeline.fps)}s
                      </div>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </main>

        {/* Side panel */}
        <aside className="flex min-h-0 w-full shrink-0 flex-col border-t border-white/10 bg-white/[0.02] lg:w-[400px] lg:border-l lg:border-t-0">
          <div className="flex gap-1 border-b border-white/10 p-2" role="tablist">
            {(
              [
                ["edit", "Edit with AI"],
                ["script", "Script"],
                ["sources", `Sources${spec.sources.length ? ` ${spec.sources.length}` : ""}`],
                ["style", "Style"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex-1 rounded-lg px-2 py-2 text-sm transition ${tab === id ? "bg-white/10 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "edit" ? <EditPanel spec={spec} ratio={ratio} onSpec={(s) => commit(s)} /> : null}
            {tab === "script" ? <ScriptPanel spec={spec} timeline={timeline} activeKey={activeKey} onSeek={seek} /> : null}
            {tab === "sources" ? <SourcesPanel spec={spec} /> : null}
            {tab === "style" ? <StylePanel spec={spec} onSpec={(s) => commit(s)} /> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
