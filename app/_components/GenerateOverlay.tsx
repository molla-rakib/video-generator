"use client";

import { useEffect, useRef, useState } from "react";
import type { DirectorEvent } from "@/lib/ai/director";
import { newProjectId, saveProject } from "@/lib/client/projects";
import { postSSE } from "@/lib/client/sse";
import type { ArtStyle, Ratio } from "@/lib/spec/schema";
import { CheckIcon, SearchIcon, SparklesIcon, Spinner, XIcon } from "./ui";

export type GenerateOptions = { prompt: string; art: ArtStyle; ratio: Ratio; lengthSec: number; research: boolean };

type Step = "research" | "writing" | "fixing" | "done";
const STEPS: { id: Step; label: string }[] = [
  { id: "research", label: "Researching the facts" },
  { id: "writing", label: "Writing & directing scenes" },
  { id: "fixing", label: "Polishing the animation" },
  { id: "done", label: "Ready to watch" },
];

type ErrorState = Extract<DirectorEvent, { type: "error" }>;

export function GenerateOverlay({ options, onClose, onDone }: { options: GenerateOptions; onClose: () => void; onDone: (projectId: string) => void }) {
  const [stage, setStage] = useState<Step>(options.research ? "research" : "writing");
  const [message, setMessage] = useState("Starting…");
  const [queries, setQueries] = useState<string[]>([]);
  const [sources, setSources] = useState<{ title: string; url: string }[]>([]);
  const [progress, setProgress] = useState<{ title?: string; scenes: number }>({ scenes: 0 });
  const [error, setError] = useState<ErrorState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    postSSE<DirectorEvent>(
      "/api/generate",
      { mode: "create", ...options },
      (e) => {
        if (e.type === "status") {
          setStage(e.stage);
          setMessage(e.message);
        } else if (e.type === "search") setQueries((q) => [...q, e.query]);
        else if (e.type === "sources") setSources((s) => [...s, ...e.items.filter((i) => !s.some((x) => x.url === i.url))].slice(0, 12));
        else if (e.type === "progress") setProgress({ title: e.title, scenes: e.scenes });
        else if (e.type === "error") setError(e);
        else if (e.type === "done") {
          const id = newProjectId();
          const now = Date.now();
          saveProject({ id, title: e.spec.meta.title, prompt: options.prompt, ratio: options.ratio, createdAt: now, updatedAt: now, spec: e.spec, history: [] });
          onDone(id);
        }
      },
      ctrl.signal,
    ).catch((err: unknown) => {
      if (!ctrl.signal.aborted) setError({ type: "error", code: "failed", message: err instanceof Error ? err.message : "Connection lost." });
    });
    return () => {
      clearInterval(timer);
      ctrl.abort();
    };
    // Runs once per job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const order = STEPS.findIndex((s) => s.id === stage);
  const steps = options.research ? STEPS : STEPS.filter((s) => s.id !== "research");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#07061099] p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="gen-title">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-[#13111f] ring-1 ring-white/10 shadow-2xl">
        <div className="absolute inset-x-0 top-0 h-1 bg-white/5">
          <div className="h-full bg-linear-to-r from-brand to-brand-2 transition-all duration-700" style={{ width: `${error ? 100 : ((order + 1) / STEPS.length) * 100}%` }} />
        </div>
        <button onClick={onClose} className="absolute right-4 top-4 rounded-full p-2 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Cancel">
          <XIcon />
        </button>

        <div className="p-6 sm:p-8">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand/80">Creating your video</p>
          <h2 id="gen-title" className="mt-2 font-display text-2xl font-semibold leading-tight sm:text-3xl">
            {progress.title ?? `“${options.prompt.length > 70 ? options.prompt.slice(0, 70) + "…" : options.prompt}”`}
          </h2>

          {error ? (
            <div className="mt-6 rounded-2xl bg-rose-500/10 p-5 ring-1 ring-rose-400/30">
              <div className="font-medium text-rose-200">{error.message}</div>
              {error.code === "missing_key" || error.code === "auth" ? (
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-zinc-300">
                  <li>
                    Get an API key at <span className="font-mono text-zinc-100">console.anthropic.com</span>
                  </li>
                  <li>
                    Create <span className="font-mono text-zinc-100">.env.local</span> in the project folder with{" "}
                    <span className="font-mono text-zinc-100">ANTHROPIC_API_KEY=…</span>
                  </li>
                  <li>Restart the dev server and try again</li>
                </ol>
              ) : null}
              <div className="mt-4 flex gap-2">
                <button onClick={onClose} className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-zinc-200">
                  Back to editing
                </button>
              </div>
            </div>
          ) : (
            <>
              <ol className="mt-6 space-y-3">
                {steps.map((s) => {
                  const idx = STEPS.findIndex((x) => x.id === s.id);
                  const state = idx < order ? "done" : idx === order ? "active" : "todo";
                  return (
                    <li key={s.id} className="flex items-center gap-3">
                      <span
                        className={`grid h-7 w-7 place-items-center rounded-full text-xs ${
                          state === "done" ? "bg-emerald-400 text-ink" : state === "active" ? "bg-brand text-ink" : "bg-white/5 text-zinc-500 ring-1 ring-white/10"
                        }`}
                      >
                        {state === "done" ? <CheckIcon className="h-4 w-4" /> : state === "active" ? <Spinner className="h-4 w-4" /> : null}
                      </span>
                      <span className={state === "todo" ? "text-zinc-500" : "text-zinc-100"}>{s.label}</span>
                      {state === "active" && s.id === "writing" && progress.scenes > 0 ? (
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-400">{progress.scenes} scenes</span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>

              <div className="mt-6 rounded-2xl bg-black/30 p-4 ring-1 ring-white/5">
                <div className="flex items-center gap-2 text-sm text-zinc-300">
                  <SparklesIcon className="h-4 w-4 text-brand" />
                  {message}
                  <span className="ml-auto tabular-nums text-xs text-zinc-500">{elapsed}s</span>
                </div>
                {queries.length ? (
                  <ul className="mt-3 space-y-1.5">
                    {queries.slice(-4).map((q, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-zinc-400">
                        <SearchIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{q}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {sources.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {sources.map((s) => (
                      <span key={s.url} className="max-w-56 truncate rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-200 ring-1 ring-emerald-400/20" title={s.url}>
                        {s.title}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="shimmer mt-4 h-1.5 rounded-full bg-white/5" />
              </div>
              <p className="mt-4 text-center text-xs text-zinc-500">This usually takes 1–3 minutes. You can keep this tab open.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
