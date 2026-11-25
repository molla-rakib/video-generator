"use client";

import { useEffect, useRef, useState } from "react";
import { DownloadIcon, RATIO_OPTIONS, RatioIcon, Spinner, XIcon } from "@/app/_components/ui";
import { postSSE } from "@/lib/client/sse";
import type { DocSpec, Ratio } from "@/lib/spec/schema";

const RESOLUTIONS = [
  { id: "720p", label: "720p", hint: "Fast" },
  { id: "1080p", label: "1080p", hint: "Full HD" },
  { id: "1440p", label: "1440p", hint: "2K" },
  { id: "4k", label: "4K", hint: "Ultra HD" },
] as const;
type Res = (typeof RESOLUTIONS)[number]["id"];

type Job = { ratio: Ratio; resolution: Res; status: "bundling" | "rendering" | "done" | "error"; progress: number; url?: string; message?: string };
type RenderEvent = { type: "progress"; stage: "bundling" | "rendering"; progress: number } | { type: "done"; url: string } | { type: "error"; message: string };

export function ExportButton({ spec, ratio }: { spec: DocSpec; ratio: Ratio }) {
  const [open, setOpen] = useState(false);
  const [pickRatio, setPickRatio] = useState<Ratio>(ratio);
  const [resolution, setResolution] = useState<Res>("1080p");
  const [jobs, setJobs] = useState<Job[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !panelRef.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const start = async () => {
    const index = jobs.length;
    const set = (patch: Partial<Job>) => setJobs((js) => js.map((j, i) => (i === index ? { ...j, ...patch } : j)));
    setJobs((js) => [...js, { ratio: pickRatio, resolution, status: "bundling", progress: 0 }]);
    try {
      await postSSE<RenderEvent>("/api/render", { spec, ratio: pickRatio, resolution }, (e) => {
        if (e.type === "progress") set({ status: e.stage, progress: e.progress });
        else if (e.type === "done") set({ status: "done", progress: 1, url: e.url });
        else set({ status: "error", message: e.message });
      });
    } catch (err) {
      set({ status: "error", message: err instanceof Error ? err.message : "Export failed" });
    }
  };

  const fileName = spec.meta.title.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "video";

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => {
          setPickRatio(ratio);
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-brand to-orange-400 px-4 py-2 font-medium text-ink shadow-lg shadow-orange-500/20 hover:brightness-105"
      >
        <DownloadIcon /> Export
      </button>
      {open ? (
        <div className="absolute right-0 top-12 z-40 w-[340px] rounded-2xl bg-[#17152a] p-4 ring-1 ring-white/15 shadow-2xl">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold">Export MP4</h3>
            <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-zinc-400 hover:bg-white/10" aria-label="Close">
              <XIcon />
            </button>
          </div>
          <div className="mt-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Format</div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {RATIO_OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => setPickRatio(o.id)}
                aria-pressed={pickRatio === o.id}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ring-1 ${pickRatio === o.id ? "bg-white text-ink ring-white" : "bg-white/[0.03] text-zinc-300 ring-white/10 hover:bg-white/[0.06]"}`}
              >
                <RatioIcon ratio={o.id} size={14} />
                <span>
                  {o.label} <span className={pickRatio === o.id ? "text-zinc-500" : "text-zinc-500"}>· {o.hint.split(" ")[0]}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 text-xs font-medium uppercase tracking-wider text-zinc-500">Resolution</div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {RESOLUTIONS.map((r) => (
              <button
                key={r.id}
                onClick={() => setResolution(r.id)}
                aria-pressed={resolution === r.id}
                className={`rounded-xl px-2 py-2 text-center text-sm ring-1 ${resolution === r.id ? "bg-white text-ink ring-white" : "bg-white/[0.03] text-zinc-300 ring-white/10 hover:bg-white/[0.06]"}`}
              >
                {r.label}
                <div className="text-[10px] text-zinc-500">{r.hint}</div>
              </button>
            ))}
          </div>
          <button onClick={start} className="mt-4 w-full rounded-xl bg-brand py-2.5 font-medium text-ink hover:brightness-105">
            Render {pickRatio} · {resolution}
          </button>

          {jobs.length ? (
            <ul className="mt-4 space-y-2 border-t border-white/10 pt-3">
              {jobs.map((j, i) => (
                <li key={i} className="rounded-xl bg-white/[0.03] p-2.5 text-sm ring-1 ring-white/5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-zinc-300">
                      <RatioIcon ratio={j.ratio} size={14} /> {j.ratio} · {j.resolution}
                    </span>
                    {j.status === "done" && j.url ? (
                      <a href={`${j.url}?download=${encodeURIComponent(`${fileName} ${j.ratio.replace(":", "x")} ${j.resolution}`)}`} className="inline-flex items-center gap-1 rounded-lg bg-emerald-400 px-2.5 py-1 text-xs font-medium text-ink">
                        <DownloadIcon className="h-3.5 w-3.5" /> Download
                      </a>
                    ) : j.status === "error" ? (
                      <span className="text-xs text-rose-300">{j.message}</span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <Spinner className="h-3.5 w-3.5" />
                        {j.status === "bundling" ? "Preparing…" : `${Math.round(j.progress * 100)}%`}
                      </span>
                    )}
                  </div>
                  {j.status === "rendering" ? (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-brand transition-all" style={{ width: `${j.progress * 100}%` }} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-zinc-500">Renders on this computer with Remotion. A 1-minute 1080p video takes about 1–3 minutes.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
