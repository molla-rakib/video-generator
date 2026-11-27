"use client";

import { Copy, MousePointerClick, Scissors, Trash2 } from "lucide-react";
import { ASPECT_RATIO_LABELS } from "@studio/shared";
import {
  boxFor,
  deleteClips,
  duplicateClip,
  MOTIONS,
  moveClip,
  PIP_POSITIONS,
  pipBox,
  replaceClipSource,
  setClipDuration,
  setClipLayout,
  splitClip,
  TRANSITIONS,
  updateClip,
  updateClips,
  type Box,
  type Clip,
  type ClipPatch,
  type PipPosition,
  type Timeline,
} from "@studio/timeline";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useEditorContext } from "../context";
import { useEditor } from "../store";

const MOTION_LABELS: Record<(typeof MOTIONS)[number], string> = {
  none: "No movement",
  zoom_in: "Slow zoom in",
  zoom_out: "Slow zoom out",
  pan_left: "Pan left",
  pan_right: "Pan right",
  pan_up: "Pan up",
  pan_down: "Pan down",
};
const TRANSITION_LABELS: Record<(typeof TRANSITIONS)[number], string> = {
  none: "Cut (for dramatic moments)",
  morph: "Morph — melts into the next shot",
  zoom_through: "Zoom through — fly into the next shot",
  whip: "Whip pan",
  iris: "Iris (circle) reveal",
  fade: "Cross-fade",
  slide_left: "Slide from right",
  slide_up: "Slide from bottom",
  wipe: "Wipe",
  zoom: "Zoom in",
};
const PIP_LABELS: Record<PipPosition, string> = {
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
  center: "Centre",
};

function NumberField({ label, value, onCommit, step = 0.1, min = 0, max, suffix }: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <input
          key={value}
          type="number"
          defaultValue={Math.round(value * 100) / 100}
          step={step}
          min={min}
          max={max}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v !== value) onCommit(v);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="h-8 w-full rounded-md border bg-background px-2 text-sm tabular-nums"
        />
        {suffix ? <span className="text-xs text-muted-foreground">{suffix}</span> : null}
      </div>
    </label>
  );
}

/** A slider that commits when released (one undo step per change). */
function Slider({ label, value, min, max, step, format, onCommit }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onCommit: (v: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex justify-between text-xs text-muted-foreground">
        {label} <span className="tabular-nums">{format(value)}</span>
      </span>
      <input
        key={value}
        type="range"
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        onPointerUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        className="w-full accent-[var(--brand)]"
      />
    </label>
  );
}

const percent = (v: number) => `${Math.round(v * 100)}%`;

export function ClipInspector() {
  const { store, playhead, mediaByPath } = useEditorContext();
  const timeline = useEditor(store, (s) => s.timeline);
  const selected = useEditor(store, (s) => s.selected);
  const clips = selected.map((id) => timeline.clips.find((c) => c.id === id)).filter((c): c is Clip => Boolean(c));
  const clip = clips[0];

  if (!clip) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
        <MousePointerClick className="size-5" />
        Select a clip on the timeline to change its timing, volume, placement and more.
      </div>
    );
  }

  if (clips.length > 1) return <MultiInspector clips={clips} />;

  const patch = (p: ClipPatch) => store.apply((t) => updateClip(t, clip.id, p));
  const visual = clip.kind === "image" || clip.kind === "video" || clip.kind === "scene";
  const hasSound = clip.kind === "audio" || clip.kind === "video";
  const isText = clip.kind === "caption" || clip.kind === "title";
  const asset = clip.src ? mediaByPath.get(clip.src) : undefined;
  const replacements = clip.src ? [...mediaByPath.values()].filter((m) => m.status === "ready" && m.path !== clip.src && m.kind === (clip.kind === "audio" ? "audio" : clip.kind)) : [];

  return (
    <div className="space-y-5 p-4">
      <div>
        <p className="text-xs tracking-wide text-muted-foreground uppercase">{clip.kind}</p>
        <input
          key={clip.id + clip.label}
          defaultValue={clip.label}
          onBlur={(e) => e.target.value !== clip.label && patch({ label: e.target.value })}
          className="w-full rounded-md bg-transparent py-1 text-base font-semibold hover:bg-surface focus:bg-surface focus:outline-none"
          placeholder="Clip name"
        />
        {clip.src || clip.component ? <p className="truncate text-xs text-muted-foreground">File: {clip.src ?? clip.component}</p> : null}
        {typeof clip.meta.prompt === "string" ? <p className="mt-1 text-xs text-muted-foreground">“{clip.meta.prompt}”</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Starts at" suffix="s" value={clip.start} onCommit={(v) => store.apply((t) => moveClip(t, clip.id, { start: v }))} />
        <NumberField label="Length" suffix="s" value={clip.duration} min={0.1} onCommit={(v) => store.apply((t) => setClipDuration(t, clip.id, v))} />
      </div>

      {isText ? (
        <div className="space-y-1.5">
          <Label>Text</Label>
          <Textarea
            key={clip.id + clip.text}
            defaultValue={clip.text}
            rows={3}
            className="font-[family-name:var(--font-bangla)] text-base"
            onBlur={(e) => e.target.value !== clip.text && patch({ text: e.target.value })}
          />
        </div>
      ) : null}

      {hasSound ? <Slider label="Volume" value={clip.volume} min={0} max={2} step={0.05} format={percent} onCommit={(v) => patch({ volume: v })} /> : null}

      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Fade in" suffix="s" value={clip.fadeIn} onCommit={(v) => patch({ fadeIn: v })} />
        <NumberField label="Fade out" suffix="s" value={clip.fadeOut} onCommit={(v) => patch({ fadeOut: v })} />
      </div>

      {clip.src && asset !== undefined ? (
        <div className="space-y-1.5">
          <Label>Replace file</Label>
          <select
            value=""
            onChange={(e) => {
              const next = replacements.find((m) => m.id === e.target.value);
              if (next) store.apply((t) => replaceClipSource(t, clip.id, next.path, next.kind === "image" ? null : next.durationSeconds, next.name));
            }}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            disabled={replacements.length === 0}
          >
            <option value="">{replacements.length ? "Choose another file…" : "Upload another file to swap it in"}</option>
            {replacements.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">Keeps the clip’s position, volume and fades.</p>
        </div>
      ) : null}

      {clip.kind === "scene" ? <SceneProps clip={clip} onChange={(props) => patch({ props })} /> : null}

      {visual ? <Placement clip={clip} timeline={timeline} /> : null}

      {clip.kind === "image" || clip.kind === "video" ? (
        <>
          <div className="space-y-1.5">
            <Label>Camera movement</Label>
            <select value={clip.motion} onChange={(e) => patch({ motion: e.target.value as Clip["motion"] })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {MOTIONS.map((m) => (
                <option key={m} value={m}>
                  {MOTION_LABELS[m]}
                </option>
              ))}
            </select>
            {clip.motion !== "none" ? (
              <Slider label="Strength" value={clip.motionStrength} min={0.1} max={1} step={0.05} format={percent} onCommit={(v) => patch({ motionStrength: v })} />
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Framing</Label>
            <select value={clip.fit} onChange={(e) => patch({ fit: e.target.value as Clip["fit"] })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="cover">Fill the box (crop edges)</option>
              <option value="contain">Show everything (add borders)</option>
            </select>
          </div>
        </>
      ) : null}

      {visual ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Transition in</Label>
            <select value={clip.transition} onChange={(e) => patch({ transition: e.target.value as Clip["transition"] })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {TRANSITIONS.map((t) => (
                <option key={t} value={t}>
                  {TRANSITION_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <NumberField label="Transition length" suffix="s" value={clip.transitionDuration} onCommit={(v) => patch({ transitionDuration: v })} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button variant="outline" size="sm" onClick={() => store.apply((t) => splitClip(t, clip.id, playhead.time).timeline)}>
          <Scissors /> Split at playhead
        </Button>
        <Button variant="outline" size="sm" onClick={() => store.apply((t) => duplicateClip(t, clip.id).timeline)}>
          <Copy /> Duplicate
        </Button>
        <Button variant="outline" size="sm" className="text-destructive" onClick={() => store.apply((t) => deleteClips(t, [clip.id]))}>
          <Trash2 /> Delete
        </Button>
      </div>
    </div>
  );
}

/** Several clips selected: change their volume together, or delete them. */
function MultiInspector({ clips }: { clips: Clip[] }) {
  const { store } = useEditorContext();
  const ids = clips.map((c) => c.id);
  const sound = clips.filter((c) => c.kind === "audio" || c.kind === "video");
  const avg = sound.length ? sound.reduce((s, c) => s + c.volume, 0) / sound.length : 1;
  return (
    <div className="space-y-5 p-4">
      <div>
        <p className="text-xs tracking-wide text-muted-foreground uppercase">Selection</p>
        <p className="text-base font-semibold">{clips.length} clips</p>
        <p className="text-xs text-muted-foreground">Shift- or Ctrl-click clips on the timeline to add or remove them.</p>
      </div>
      {sound.length ? (
        <Slider
          label={`Volume of ${sound.length} clip${sound.length === 1 ? "" : "s"}`}
          value={avg}
          min={0}
          max={2}
          step={0.05}
          format={percent}
          onCommit={(v) => store.apply((t) => updateClips(t, sound.map((c) => c.id), { volume: v }))}
        />
      ) : null}
      <Button variant="outline" size="sm" className="text-destructive" onClick={() => store.apply((t) => deleteClips(t, ids))}>
        <Trash2 /> Delete {clips.length} clips
      </Button>
    </div>
  );
}

/** Edit the parameters a scene component accepts (numbers, text, on/off, colours). */
function SceneProps({ clip, onChange }: { clip: Clip; onChange: (props: Record<string, unknown>) => void }) {
  const entries = Object.entries(clip.props);
  if (entries.length === 0) {
    return <p className="rounded-md bg-surface p-2 text-xs text-muted-foreground">This scene has no adjustable settings.</p>;
  }
  const set = (key: string, value: unknown) => onChange({ ...clip.props, [key]: value });
  return (
    <div className="space-y-3">
      <Label>Scene settings</Label>
      {entries.map(([key, value]) => {
        const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
        if (typeof value === "number") {
          const max = Math.max(2, Math.abs(value) * 2);
          return <Slider key={key} label={label} value={value} min={0} max={max} step={max / 100} format={(v) => String(Math.round(v * 100) / 100)} onCommit={(v) => set(key, v)} />;
        }
        if (typeof value === "boolean") {
          return (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={value} onChange={(e) => set(key, e.target.checked)} className="size-4 accent-[var(--brand)]" /> {label}
            </label>
          );
        }
        if (typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value)) {
          return (
            <label key={key} className="flex items-center justify-between gap-2 text-sm">
              {label}
              <input type="color" value={value.length === 4 ? `#${[...value.slice(1)].map((c) => c + c).join("")}` : value.slice(0, 7)} onChange={(e) => set(key, e.target.value)} className="h-8 w-14 rounded border" />
            </label>
          );
        }
        if (typeof value === "string") {
          return (
            <label key={key} className="block space-y-1">
              <span className="text-xs text-muted-foreground">{label}</span>
              <input
                key={clip.id + key + value}
                defaultValue={value}
                onBlur={(e) => e.target.value !== value && set(key, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="h-8 w-full rounded-md border bg-background px-2 text-sm"
              />
            </label>
          );
        }
        return null;
      })}
    </div>
  );
}

/** Full frame or picture-in-picture, with an optional position per shape. */
function Placement({ clip, timeline }: { clip: Clip; timeline: Timeline }) {
  const { store, mediaByPath } = useEditorContext();
  const ratio = timeline.ratio;
  const own = clip.layout.byRatio[ratio] !== undefined;
  const target = own ? ratio : "default";
  const box = boxFor(clip, ratio);
  const asset = clip.src ? mediaByPath.get(clip.src) : undefined;
  const sourceAspect = asset?.width && asset.height ? asset.width / asset.height : 16 / 9;
  const apply = (b: Box | null | undefined, which: typeof target = target) => store.apply((t) => setClipLayout(t, clip.id, which, b));

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="space-y-2">
        <Label>Placement</Label>
        <div className="grid grid-cols-2 rounded-md border p-0.5 text-xs">
          <button className={cn("rounded px-2 py-1", !box && "bg-brand-soft font-medium text-brand")} onClick={() => apply(null)}>
            Full frame
          </button>
          <button className={cn("rounded px-2 py-1", box && "bg-brand-soft font-medium text-brand")} onClick={() => !box && apply(pipBox("bottom-right", ratio, sourceAspect))}>
            Picture-in-picture
          </button>
        </div>
      </div>
      {box ? (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            {PIP_POSITIONS.map((p) => (
              <button
                key={p}
                className="rounded-md border px-1.5 py-1 text-[11px] hover:bg-surface"
                onClick={() => apply({ ...pipBox(p, ratio, sourceAspect, box.w), radius: box.radius })}
              >
                {PIP_LABELS[p]}
              </button>
            ))}
          </div>
          <Slider
            label="Size"
            value={box.w}
            min={0.1}
            max={1}
            step={0.01}
            format={percent}
            onCommit={(w) => {
              const f = w / box.w;
              apply({ ...box, w, h: Math.min(1.5, box.h * f), x: box.x + (box.w - w) / 2, y: box.y + (box.h - box.h * f) / 2 });
            }}
          />
          <Slider label="Rounded corners" value={box.radius} min={0} max={0.5} step={0.01} format={(v) => (v >= 0.5 ? "Circle" : percent(v * 2))} onCommit={(radius) => apply({ ...box, radius })} />
          <p className="text-[11px] text-muted-foreground">Tip: drag the box on the preview to move it; drag its corner to resize.</p>
        </>
      ) : null}
      <label className="flex items-start gap-2 border-t pt-2 text-xs">
        <input
          type="checkbox"
          className="mt-0.5 size-3.5 accent-[var(--brand)]"
          checked={own}
          onChange={(e) => {
            if (e.target.checked) apply(box ? { ...box } : null, ratio);
            else apply(undefined, ratio);
          }}
        />
        <span>
          Separate placement for {ratio} ({ASPECT_RATIO_LABELS[ratio].name})
          <span className="block text-muted-foreground">
            {own ? `Changes here only affect ${ratio}.` : "Changes here apply to every shape without its own placement."}
          </span>
        </span>
      </label>
    </div>
  );
}
