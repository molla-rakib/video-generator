"use client";

import { useRef, useState } from "react";
import { SearchIcon, SendIcon, SparklesIcon, Spinner } from "@/app/_components/ui";
import type { DirectorEvent } from "@/lib/ai/director";
import { postSSE } from "@/lib/client/sse";
import type { DocSpec, Ratio } from "@/lib/spec/schema";

const SUGGESTIONS = [
  "Make it funnier and more playful",
  "Simplify the narration for 8-year-olds",
  "Add a final scene with a surprising fact",
  "Make every scene more dynamic",
  "Shorten it to about 45 seconds",
  "Switch to a night-time mood",
];

type Turn = { request: string; status: "working" | "done" | "error"; note?: string };

export function EditPanel({ spec, ratio, onSpec }: { spec: DocSpec; ratio: Ratio; onSpec: (s: DocSpec) => void }) {
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [live, setLive] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busy = turns.at(-1)?.status === "working";

  const update = (patch: Partial<Turn>) => setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, ...patch } : x)));

  const send = async (request: string) => {
    const r = request.trim();
    if (!r || busy) return;
    setText("");
    setTurns((t) => [...t, { request: r, status: "working" }]);
    setLive("Reading your video…");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await postSSE<DirectorEvent>(
        "/api/generate",
        { mode: "edit", prompt: r, spec, ratio, art: spec.style.art, research: true },
        (e) => {
          if (e.type === "status") setLive(e.message);
          else if (e.type === "search") setLive(`Searching: ${e.query}`);
          else if (e.type === "progress" && e.scenes) setLive(`Directing scenes… (${e.scenes})`);
          else if (e.type === "error") update({ status: "error", note: e.message });
          else if (e.type === "done") {
            onSpec(e.spec);
            update({ status: "done", note: "Updated — press Undo to go back." });
          }
        },
        ctrl.signal,
      );
    } catch (err) {
      if (!ctrl.signal.aborted) update({ status: "error", note: err instanceof Error ? err.message : "Connection lost." });
    } finally {
      setLive(null);
      setTurns((t) => t.map((x) => (x.status === "working" ? { ...x, status: "error", note: x.note ?? "Stopped." } : x)));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 p-4">
        {!turns.length ? (
          <div className="rounded-2xl bg-linear-to-br from-brand/10 to-brand-2/10 p-4 ring-1 ring-white/10">
            <div className="flex items-center gap-2 font-display text-lg font-semibold">
              <SparklesIcon className="h-5 w-5 text-brand" /> Change anything by asking
            </div>
            <p className="mt-1 text-sm text-zinc-400">Claude rewrites the plan and Remotion re-animates it instantly. Every change can be undone.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full bg-white/5 px-3 py-1.5 text-left text-xs text-zinc-300 ring-1 ring-white/10 hover:bg-white/10 hover:text-white">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {turns.map((t, i) => (
          <div key={i} className="space-y-2">
            <div className="ml-8 rounded-2xl rounded-br-md bg-white px-3.5 py-2.5 text-sm text-ink">{t.request}</div>
            <div className="mr-8 flex items-start gap-2 rounded-2xl rounded-bl-md bg-white/5 px-3.5 py-2.5 text-sm ring-1 ring-white/10">
              {t.status === "working" ? (
                <>
                  <Spinner className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  <span className="text-zinc-300">{live?.startsWith("Searching") ? <SearchIcon className="mr-1 inline h-3.5 w-3.5" /> : null}{live ?? "Working…"}</span>
                </>
              ) : (
                <span className={t.status === "error" ? "text-rose-300" : "text-emerald-300"}>{t.note}</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <form
        className="sticky bottom-0 border-t border-white/10 bg-[#0f0e1c] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <div className="flex items-end gap-2 rounded-2xl bg-white/5 p-2 ring-1 ring-white/10 focus-within:ring-brand/50">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            rows={2}
            disabled={busy}
            placeholder={busy ? "Working on your change…" : "e.g. “Add a scene where Orville fixes the engine”"}
            aria-label="Describe a change"
            className="min-h-11 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm placeholder:text-zinc-500 focus:outline-none"
          />
          {busy ? (
            <button type="button" onClick={() => abortRef.current?.abort()} className="rounded-xl px-3 py-2 text-sm text-zinc-300 hover:bg-white/10">
              Stop
            </button>
          ) : (
            <button type="submit" disabled={!text.trim()} className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-ink disabled:opacity-40" aria-label="Send">
              <SendIcon />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
