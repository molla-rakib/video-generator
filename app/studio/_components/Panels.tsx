"use client";

import { ART_OPTIONS, BookIcon } from "@/app/_components/ui";
import type { Claim, DocSpec } from "@/lib/spec/schema";
import type { Timeline } from "@/lib/spec/timeline";

const CLAIM_STYLE: Record<Claim["status"], string> = {
  verified: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  disputed: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  unsupported: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

const fmt = (frames: number, fps: number) => {
  const s = Math.floor(frames / fps);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function ScriptPanel({ spec, timeline, activeKey, onSeek }: { spec: DocSpec; timeline: Timeline; activeKey?: string; onSeek: (frame: number) => void }) {
  const sourceById = new Map(spec.sources.map((s) => [s.id, s]));
  return (
    <div className="p-3">
      {spec.chapters.map((chapter, ci) => (
        <section key={chapter.id} className="mb-4">
          <h3 className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand/80">
            Chapter {ci + 1} · {chapter.title}
          </h3>
          <ol className="space-y-1.5">
            {chapter.scenes.map((scene) => {
              const seg = timeline.segments.find((s) => s.key === `scene-${scene.id}`);
              const active = seg?.key === activeKey;
              return (
                <li key={scene.id}>
                  <button
                    onClick={() => seg && seg.kind === "scene" && onSeek(seg.from + seg.visibleStart)}
                    className={`w-full rounded-xl p-3 text-left transition ${active ? "bg-white/10 ring-1 ring-brand/40" : "hover:bg-white/5"}`}
                  >
                    <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
                      <span>
                        {scene.visual.type === "animation" ? `${scene.visual.background.scene} · ${scene.visual.background.time}` : scene.visual.type}
                      </span>
                      {seg ? <span className="tabular-nums">{fmt(seg.from, timeline.fps)}</span> : null}
                    </div>
                    <p className="text-sm leading-relaxed text-zinc-200">{scene.narration || <span className="italic text-zinc-500">No narration</span>}</p>
                    {scene.claims.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {scene.claims.map((c, k) => (
                          <span key={k} title={c.text} className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${CLAIM_STYLE[c.status]}`}>
                            {c.status === "verified" ? "✓" : "!"} {c.sourceIds.map((id) => sourceById.get(id)?.publisher ?? id).join(" + ")}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

export function SourcesPanel({ spec }: { spec: DocSpec }) {
  if (!spec.sources.length) {
    return (
      <div className="p-6 text-center text-sm text-zinc-500">
        <BookIcon className="mx-auto mb-2 h-6 w-6" />
        No sources — this video was made without fact-checking (or it’s a fictional story).
      </div>
    );
  }
  const claims = spec.chapters.flatMap((c) => c.scenes.flatMap((s) => s.claims));
  return (
    <ul className="space-y-2 p-3">
      {spec.sources.map((s) => {
        const uses = claims.filter((c) => c.sourceIds.includes(s.id)).length;
        return (
          <li key={s.id} className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/5">
            <div className="text-sm font-medium">{s.title}</div>
            <div className="text-xs text-zinc-400">{s.publisher}</div>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-xs text-sky-400 hover:underline">
              {s.url}
            </a>
            <div className="mt-1 text-[11px] text-zinc-500">
              Supports {uses} claim{uses === 1 ? "" : "s"}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function StylePanel({ spec, onSpec }: { spec: DocSpec; onSpec: (s: DocSpec) => void }) {
  return (
    <div className="space-y-6 p-4">
      <div>
        <h3 className="text-sm font-medium text-zinc-200">Art style</h3>
        <p className="text-xs text-zinc-500">Changes instantly — no AI needed.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {ART_OPTIONS.map((o) => {
            const active = spec.style.art === o.id;
            return (
              <button
                key={o.id}
                onClick={() => onSpec({ ...spec, style: { ...spec.style, art: o.id } })}
                aria-pressed={active}
                className={`rounded-xl p-3 text-left ring-1 transition ${active ? "bg-brand/15 ring-brand" : "bg-white/[0.03] ring-white/10 hover:bg-white/[0.06]"}`}
              >
                <span className="flex gap-1" aria-hidden>
                  {o.swatch.map((c) => (
                    <span key={c} className="h-4 w-4 rounded-full ring-1 ring-black/30" style={{ background: c }} />
                  ))}
                </span>
                <div className="mt-2 text-sm font-medium">{o.label}</div>
                <div className="text-xs text-zinc-500">{o.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-200">Options</h3>
        <Toggle
          label="Captions"
          hint="Subtitles for the narration"
          on={spec.captions.enabled}
          onChange={(v) => onSpec({ ...spec, captions: { ...spec.captions, enabled: v } })}
        />
        <Toggle label="Film grain" hint="Subtle vintage texture" on={spec.style.grain} onChange={(v) => onSpec({ ...spec, style: { ...spec.style, grain: v } })} />
        <Toggle
          label="Sources & credits card"
          hint="Shown at the end of the video"
          on={spec.endCard.showSources || spec.endCard.showCredits}
          onChange={(v) => onSpec({ ...spec, endCard: { showSources: v, showCredits: v } })}
        />
      </div>
    </div>
  );
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/[0.03] p-3 text-left ring-1 ring-white/10">
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-zinc-500">{hint}</span>
      </span>
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition ${on ? "bg-brand" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
