"use client";

import { Copy, MousePointerClick, Scissors, Trash2 } from "lucide-react";
import {
  deleteClips,
  duplicateClip,
  MOTIONS,
  moveClip,
  setClipDuration,
  splitClip,
  TRANSITIONS,
  updateClip,
  type Clip,
  type ClipPatch,
} from "@studio/timeline";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  none: "Cut",
  fade: "Fade",
  slide_left: "Slide from right",
  slide_up: "Slide from bottom",
  wipe: "Wipe",
  zoom: "Zoom in",
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

export function ClipInspector() {
  const { store, playhead, mediaById } = useEditorContext();
  const timeline = useEditor(store, (s) => s.timeline);
  const selected = useEditor(store, (s) => s.selected);
  const clip = timeline.clips.find((c) => c.id === selected[0]);

  if (!clip) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
        <MousePointerClick className="size-5" />
        Select a clip on the timeline (double-click opens it here) to change its timing, volume, movement and transitions.
      </div>
    );
  }

  const patch = (p: ClipPatch) => store.apply((t) => updateClip(t, clip.id, p));
  const asset = clip.assetId ? mediaById.get(clip.assetId) : undefined;
  const visual = clip.kind === "image" || clip.kind === "video";
  const hasSound = clip.kind === "audio" || clip.kind === "video";
  const isText = clip.kind === "subtitle" || clip.kind === "title";

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
        {asset ? <p className="truncate text-xs text-muted-foreground">File: {asset.name}</p> : null}
        {selected.length > 1 ? <p className="text-xs text-muted-foreground">{selected.length} clips selected — showing the first.</p> : null}
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

      {hasSound ? (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="flex justify-between text-xs text-muted-foreground">
              Volume <span className="tabular-nums">{Math.round(clip.volume * 100)}%</span>
            </span>
            <input
              key={clip.id}
              type="range"
              min={0}
              max={2}
              step={0.05}
              defaultValue={clip.volume}
              onPointerUp={(e) => patch({ volume: Number((e.target as HTMLInputElement).value) })}
              onKeyUp={(e) => patch({ volume: Number((e.target as HTMLInputElement).value) })}
              className="w-full accent-[var(--brand)]"
            />
          </label>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Fade in" suffix="s" value={clip.fadeIn} onCommit={(v) => patch({ fadeIn: v })} />
        <NumberField label="Fade out" suffix="s" value={clip.fadeOut} onCommit={(v) => patch({ fadeOut: v })} />
      </div>

      {visual ? (
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
              <label className="block space-y-1 pt-1">
                <span className="text-xs text-muted-foreground">Strength</span>
                <input
                  key={clip.id + "s"}
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  defaultValue={clip.motionStrength}
                  onPointerUp={(e) => patch({ motionStrength: Number((e.target as HTMLInputElement).value) })}
                  className="w-full accent-[var(--brand)]"
                />
              </label>
            ) : null}
          </div>
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
          <div className="space-y-1.5">
            <Label>Framing</Label>
            <select value={clip.fit} onChange={(e) => patch({ fit: e.target.value as Clip["fit"] })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="cover">Fill the frame (crop edges)</option>
              <option value="contain">Show everything (add borders)</option>
            </select>
          </div>
        </>
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
