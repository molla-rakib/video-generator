"use client";

import { memo, useEffect, useRef } from "react";
import {
  AudioLines,
  Captions,
  Clapperboard,
  Copy,
  Eye,
  EyeOff,
  Film,
  Layers,
  Lock,
  LockOpen,
  Magnet,
  MoreVertical,
  Music,
  Plus,
  Scissors,
  Trash2,
  Type,
  Volume2,
  VolumeX,
  Waves,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { MediaAsset } from "@studio/database";
import {
  addTrack,
  deleteClips,
  duplicateClip,
  formatClock,
  moveClip,
  removeTrack,
  snapTime,
  splitClip,
  timelineDuration,
  trimClipEnd,
  trimClipStart,
  updateTrack,
  type Clip,
  type Timeline,
  type Track,
  type TrackRole,
} from "@studio/timeline";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { mediaUrl, useEditorContext } from "../context";
import { AskClaudeButton } from "../ask-claude";
import { placeAsset } from "../place-asset";
import { useEditor, usePlayhead } from "../store";
import { Filmstrip, Waveform } from "./waveform";

export const ASSET_DRAG_TYPE = "application/x-studio-asset";
const HEADER_W = 196;
const RULER_H = 28;
const trackHeight = (t: Track) => (t.kind === "text" ? 40 : 58);

const ROLE_ICONS: Record<TrackRole, LucideIcon> = {
  scenes: Clapperboard,
  overlay: Layers,
  voice: AudioLines,
  music: Music,
  sfx: Waves,
  ambience: Waves,
  other: Music,
  captions: Captions,
  titles: Type,
};

type DragMode = "move" | "trim-start" | "trim-end";

export function TimelineView() {
  const { store, playhead, mediaById, mediaByPath, fileVersions, inspect } = useEditorContext();
  const committed = useEditor(store, (s) => s.timeline);
  const draft = useEditor(store, (s) => s.draft);
  const zoom = useEditor(store, (s) => s.zoom);
  const selected = useEditor(store, (s) => s.selected);
  const snap = useEditor(store, (s) => s.snap);
  const timeline = draft ?? committed;
  const scrollRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const laneRefs = useRef(new Map<string, HTMLDivElement>());
  const drag = useRef<{ clipId: string; mode: DragMode; startX: number; origin: Clip; base: Timeline; moved: boolean } | null>(null);

  const duration = timelineDuration(timeline);
  const contentWidth = Math.max(duration + 20, 60) * zoom;

  const timeAt = (clientX: number) => {
    const rect = rulerRef.current?.getBoundingClientRect();
    return rect ? Math.max(0, (clientX - rect.left) / zoom) : 0;
  };
  const trackAtY = (clientY: number): string | null => {
    for (const [id, el] of laneRefs.current) {
      const r = el.getBoundingClientRect();
      if (clientY >= r.top && clientY < r.bottom) return id;
    }
    return null;
  };

  // ---- Clip dragging ------------------------------------------------------
  function onClipPointerDown(e: React.PointerEvent, clip: Clip, mode: DragMode) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const base = store.getSnapshot().timeline;
    const track = base.tracks.find((t) => t.id === clip.trackId);
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      const cur = store.getSnapshot().selected;
      store.select(cur.includes(clip.id) ? cur.filter((i) => i !== clip.id) : [...cur, clip.id]);
      return;
    }
    if (!store.getSnapshot().selected.includes(clip.id)) store.select([clip.id]);
    if (track?.locked) return; // selectable, not movable
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { clipId: clip.id, mode, startX: e.clientX, origin: clip, base, moved: false };
  }

  function onClipPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.startX) < 3) return;
    d.moved = true;
    const dx = (e.clientX - d.startX) / zoom;
    const snapT = (t: number) => (snap ? snapTime(d.base, t, { threshold: 8 / zoom, excludeClipId: d.clipId, extra: [playhead.time] }) : t);
    try {
      let next: Timeline;
      if (d.mode === "move") {
        let start = Math.max(0, d.origin.start + dx);
        const s = snapT(start);
        if (s !== start) start = s;
        else {
          const end = start + d.origin.duration;
          const se = snapT(end);
          if (se !== end) start = Math.max(0, se - d.origin.duration);
        }
        const trackId = trackAtY(e.clientY) ?? d.origin.trackId;
        try {
          next = moveClip(d.base, d.clipId, { start, trackId });
        } catch {
          next = moveClip(d.base, d.clipId, { start });
        }
      } else if (d.mode === "trim-start") {
        next = trimClipStart(d.base, d.clipId, snapT(d.origin.start + dx));
      } else {
        next = trimClipEnd(d.base, d.clipId, snapT(d.origin.start + d.origin.duration + dx));
      }
      store.setDraft(next);
    } catch {
      // Not allowed (e.g. locked) — keep the last valid preview.
    }
  }

  function onClipPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const preview = store.getSnapshot().draft;
    if (d.moved && preview) store.apply(() => preview);
    else store.setDraft(null);
  }

  // ---- Empty-lane click (seek) or drag (select a time range) --------------
  const rangeDrag = useRef<{ x: number; t: number; moved: boolean } | null>(null);
  function onLaneDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    rangeDrag.current = { x: e.clientX, t: timeAt(e.clientX), moved: false };
  }
  function onLaneMove(e: React.PointerEvent) {
    const d = rangeDrag.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x) < 5) return;
    d.moved = true;
    const t = timeAt(e.clientX);
    store.setRange({ start: Math.min(d.t, t), end: Math.max(d.t, t) });
  }
  function onLaneUp() {
    const d = rangeDrag.current;
    rangeDrag.current = null;
    if (!d) return;
    if (!d.moved) {
      store.select([]);
      store.setRange(null);
      playhead.seek(d.t);
    } else {
      const r = store.getSnapshot().range;
      if (r && r.end - r.start < 0.2) store.setRange(null);
      else if (r) playhead.seek(r.start);
    }
  }

  // ---- Ruler scrubbing ----------------------------------------------------
  const scrubbing = useRef(false);
  function onRulerDown(e: React.PointerEvent) {
    scrubbing.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    playhead.seek(timeAt(e.clientX));
  }

  // ---- Dropping media from the Media panel -------------------------------
  function onLaneDrop(e: React.DragEvent, track: Track) {
    const assetId = e.dataTransfer.getData(ASSET_DRAG_TYPE);
    if (!assetId) return;
    e.preventDefault();
    const asset = mediaById.get(assetId);
    if (!asset) return;
    if (asset.status !== "ready") return toast.error("This file is still being prepared. Try again in a moment.");
    let at = timeAt(e.clientX);
    if (snap) at = snapTime(store.getSnapshot().timeline, at, { threshold: 8 / zoom, extra: [playhead.time] });
    store.apply((t) => placeAsset(t, asset, at, track));
  }

  return (
    <section className="flex h-[330px] shrink-0 flex-col border-t" aria-label="Timeline">
      <TimelineToolbar
        duration={duration}
        onFit={() => {
          const w = scrollRef.current?.clientWidth ?? 800;
          store.setZoom((w - HEADER_W - 40) / Math.max(duration, 5));
        }}
      />
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto bg-background">
        <div className="relative" style={{ width: HEADER_W + contentWidth }}>
          {/* Ruler */}
          <div className="sticky top-0 z-30 flex border-b bg-background" style={{ height: RULER_H }}>
            <div className="sticky left-0 z-40 shrink-0 border-r bg-background" style={{ width: HEADER_W }} />
            <div
              ref={rulerRef}
              className="relative flex-1 cursor-pointer select-none"
              onPointerDown={onRulerDown}
              onPointerMove={(e) => scrubbing.current && playhead.seek(timeAt(e.clientX))}
              onPointerUp={() => (scrubbing.current = false)}
            >
              <Ruler zoom={zoom} width={contentWidth} />
              {timeline.markers.map((m) => (
                <div key={m.id} className="absolute top-0 flex h-full items-start" style={{ left: m.time * zoom }} title={m.label}>
                  <div className="h-full w-px bg-brand" />
                  <span className="max-w-36 truncate rounded-r bg-brand px-1 text-[10px] leading-4 font-medium text-brand-foreground">{m.label}</span>
                </div>
              ))}
              <PlayheadHead zoom={zoom} />
            </div>
          </div>

          {/* Tracks */}
          {timeline.tracks.map((track) => (
            <div key={track.id} className="flex border-b" style={{ height: trackHeight(track) }}>
              <TrackHeader track={track} timeline={timeline} />
              <div
                ref={(el) => {
                  if (el) laneRefs.current.set(track.id, el);
                  else laneRefs.current.delete(track.id);
                }}
                className={cn("relative flex-1", track.hidden || track.muted ? "bg-surface/80" : "bg-surface/40")}
                onPointerDown={onLaneDown}
                onPointerMove={onLaneMove}
                onPointerUp={onLaneUp}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(ASSET_DRAG_TYPE)) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                  }
                }}
                onDrop={(e) => onLaneDrop(e, track)}
              >
                {timeline.clips
                  .filter((c) => c.trackId === track.id)
                  .map((clip) => {
                    const file = clip.src ?? clip.component;
                    return (
                      <ClipView
                        key={clip.id}
                        clip={clip}
                        track={track}
                        zoom={zoom}
                        height={trackHeight(track)}
                        selected={selected.includes(clip.id)}
                        asset={clip.src ? mediaByPath.get(clip.src) : undefined}
                        missing={Boolean(file) && fileVersions[file!] === null}
                        onPointerDown={onClipPointerDown}
                        onPointerMove={onClipPointerMove}
                        onPointerUp={onClipPointerUp}
                        onDoubleClick={() => inspect(clip.id)}
                      />
                    );
                  })}
              </div>
            </div>
          ))}
          <AddTrackRow />
          <RangeBand zoom={zoom} />
          <PlayheadLine zoom={zoom} scrollRef={scrollRef} />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function TimelineToolbar({ duration, onFit }: { duration: number; onFit: () => void }) {
  const { store, playhead } = useEditorContext();
  const zoom = useEditor(store, (s) => s.zoom);
  const snap = useEditor(store, (s) => s.snap);
  const selected = useEditor(store, (s) => s.selected);
  const { time } = usePlayhead(playhead);

  const tool = (label: string, icon: React.ReactNode, onClick: () => void, opts: { disabled?: boolean; active?: boolean } = {}) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant={opts.active ? "secondary" : "ghost"} size="icon-sm" onClick={onClick} disabled={opts.disabled} aria-label={label}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b bg-background px-2">
      {tool(
        "Split at playhead (S)",
        <Scissors />,
        () => {
          const id = selected[0];
          if (!id) return toast.message("Select a clip, put the playhead inside it, then split.");
          store.apply((t) => splitClip(t, id, playhead.time).timeline);
        },
        { disabled: selected.length !== 1 },
      )}
      {tool("Duplicate", <Copy />, () => store.apply((t) => duplicateClip(t, selected[0]!).timeline), { disabled: selected.length !== 1 })}
      {tool("Delete (Del)", <Trash2 />, () => store.apply((t) => deleteClips(t, selected)), { disabled: selected.length === 0 })}
      <div className="mx-1 h-5 w-px bg-border" />
      {tool(snap ? "Snapping on" : "Snapping off", <Magnet />, store.toggleSnap, { active: snap })}
      <span className="ml-2 text-xs tabular-nums text-muted-foreground">
        {formatClock(time)} / {formatClock(duration)}
      </span>
      {selected.length > 1 ? <span className="ml-2 text-xs text-muted-foreground">{selected.length} clips selected</span> : null}
      <div className="ml-3">
        <AskClaudeButton />
      </div>
      <div className="ml-auto flex items-center gap-1">
        {tool("Zoom out", <ZoomOut />, () => store.setZoom(zoom / 1.5))}
        <input
          type="range"
          min={Math.log(4)}
          max={Math.log(400)}
          step={0.01}
          value={Math.log(zoom)}
          onChange={(e) => store.setZoom(Math.exp(Number(e.target.value)))}
          className="w-28 accent-[var(--brand)]"
          aria-label="Zoom"
        />
        {tool("Zoom in", <ZoomIn />, () => store.setZoom(zoom * 1.5))}
        <Button variant="ghost" size="sm" onClick={onFit}>
          Fit
        </Button>
      </div>
    </div>
  );
}

const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

function Ruler({ zoom, width }: { zoom: number; width: number }) {
  const step = TICK_STEPS.find((s) => s * zoom >= 70) ?? 600;
  const count = Math.ceil(width / (step * zoom)) + 1;
  return (
    <div className="pointer-events-none absolute inset-0">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="absolute top-0 h-full border-l border-border" style={{ left: i * step * zoom }}>
          <span className="absolute top-1 left-1 text-[10px] tabular-nums text-muted-foreground">{formatClock(i * step)}</span>
          {[1, 2, 3].map((q) => (
            <div key={q} className="absolute bottom-0 h-1.5 border-l border-border" style={{ left: (q * step * zoom) / 4 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The selected time range, drawn across every track. */
function RangeBand({ zoom }: { zoom: number }) {
  const { store } = useEditorContext();
  const range = useEditor(store, (s) => s.range);
  if (!range) return null;
  return (
    <div
      className="pointer-events-none absolute bottom-0 z-[15] border-x-2 border-brand bg-brand/10"
      style={{ top: RULER_H, left: HEADER_W + range.start * zoom, width: Math.max(2, (range.end - range.start) * zoom) }}
    >
      <span className="pointer-events-auto absolute -top-px left-1 flex items-center gap-1 rounded-b-md bg-brand px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-brand-foreground shadow-sm">
        {formatClock(range.start)} – {formatClock(range.end)}
        <button className="rounded px-0.5 hover:bg-black/15" onClick={() => store.setRange(null)} aria-label="Clear the selected range">
          ×
        </button>
      </span>
    </div>
  );
}

function PlayheadLine({ zoom, scrollRef }: { zoom: number; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const { playhead } = useEditorContext();
  const { time, playing } = usePlayhead(playhead);
  const x = HEADER_W + time * zoom;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft + HEADER_W) el.scrollLeft = x - HEADER_W - 60;
  }, [x, playing, scrollRef]);
  return <div className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-destructive" style={{ left: x }} />;
}

/** "1:05.4" — minutes, seconds and tenths, for the playhead handle. */
function formatPrecise(seconds: number): string {
  const tenths = Math.floor((seconds % 1) * 10);
  return `${formatClock(seconds)}.${tenths}`;
}

/**
 * The playhead's handle, drawn inside the ruler (which sits on top of the
 * tracks) so it's always visible. Dragging it scrubs, like the ruler itself.
 */
function PlayheadHead({ zoom }: { zoom: number }) {
  const { playhead } = useEditorContext();
  const { time } = usePlayhead(playhead);
  const x = time * zoom;
  const HALF = 22;
  return (
    <div className="pointer-events-none absolute top-0 z-10 flex flex-col items-center" style={{ left: x, transform: `translateX(-${Math.min(HALF, x)}px)` }}>
      <span className="rounded-[4px] bg-destructive px-1.5 py-px text-[10px] leading-4 font-semibold tabular-nums text-white shadow-sm">{formatPrecise(time)}</span>
      <span
        className="-mt-px size-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-destructive"
        style={{ marginLeft: x < HALF ? (x - HALF) * 2 : 0 }}
        aria-hidden
      />
    </div>
  );
}

function TrackHeader({ track, timeline }: { track: Track; timeline: Timeline }) {
  const { store } = useEditorContext();
  const Icon = ROLE_ICONS[track.role] ?? Film;
  const empty = !timeline.clips.some((c) => c.trackId === track.id);
  const hasSound = track.kind === "audio" || track.role === "overlay";
  const iconBtn = "rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground";
  return (
    <div className="sticky left-0 z-10 flex shrink-0 items-center gap-0.5 border-r bg-background px-2" style={{ width: HEADER_W }}>
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <input
        key={track.name}
        defaultValue={track.name}
        onBlur={(e) => {
          const name = e.target.value.trim();
          if (name && name !== track.name) store.apply((t) => updateTrack(t, track.id, { name }));
          else e.target.value = track.name;
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="min-w-0 flex-1 truncate rounded bg-transparent px-1 text-xs font-medium hover:bg-surface focus:bg-surface focus:outline-none"
        aria-label="Track name"
      />
      {track.kind === "audio" ? (
        <button
          className={cn(iconBtn, "px-1.5 text-[10px] leading-none font-bold", track.solo && "bg-warning-soft text-foreground")}
          onClick={() => store.apply((t) => updateTrack(t, track.id, { solo: !track.solo }))}
          aria-label={track.solo ? `Stop soloing ${track.name}` : `Solo ${track.name}`}
          aria-pressed={track.solo}
          title="Solo: hear only soloed tracks"
        >
          S
        </button>
      ) : null}
      {hasSound ? (
        <button className={iconBtn} onClick={() => store.apply((t) => updateTrack(t, track.id, { muted: !track.muted }))} aria-label={track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`}>
          {track.muted ? <VolumeX className="size-3.5 text-destructive" /> : <Volume2 className="size-3.5" />}
        </button>
      ) : null}
      {track.kind !== "audio" ? (
        <button className={iconBtn} onClick={() => store.apply((t) => updateTrack(t, track.id, { hidden: !track.hidden }))} aria-label={track.hidden ? `Show ${track.name}` : `Hide ${track.name}`}>
          {track.hidden ? <EyeOff className="size-3.5 text-destructive" /> : <Eye className="size-3.5" />}
        </button>
      ) : null}
      <button className={iconBtn} onClick={() => store.apply((t) => updateTrack(t, track.id, { locked: !track.locked }))} aria-label={track.locked ? `Unlock ${track.name}` : `Lock ${track.name}`}>
        {track.locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5 opacity-40" />}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label={`More for ${track.name}`}>
            <MoreVertical className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {hasSound ? (
            <>
              <DropdownMenuLabel className="flex justify-between text-xs font-normal text-muted-foreground">
                Track volume <span className="tabular-nums">{Math.round(track.volume * 100)}%</span>
              </DropdownMenuLabel>
              <div className="px-2 pb-2">
                <input
                  key={track.id + track.volume}
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  defaultValue={track.volume}
                  onPointerUp={(e) => store.apply((t) => updateTrack(t, track.id, { volume: Number((e.target as HTMLInputElement).value) }))}
                  onKeyUp={(e) => store.apply((t) => updateTrack(t, track.id, { volume: Number((e.target as HTMLInputElement).value) }))}
                  className="w-full accent-[var(--brand)]"
                  aria-label={`${track.name} volume`}
                />
              </div>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem variant="destructive" disabled={!empty} onSelect={() => store.apply((t) => removeTrack(t, track.id))}>
            Remove track{empty ? "" : " (not empty)"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const ADDABLE: Array<{ role: TrackRole; label: string }> = [
  { role: "overlay", label: "Overlay (your video, pictures)" },
  { role: "scenes", label: "Scenes" },
  { role: "music", label: "Music" },
  { role: "sfx", label: "Sound effects" },
  { role: "ambience", label: "Ambience" },
  { role: "voice", label: "Voice" },
  { role: "captions", label: "Captions" },
  { role: "titles", label: "Titles" },
];

function AddTrackRow() {
  const { store } = useEditorContext();
  return (
    <div className="flex h-9">
      <div className="sticky left-0 z-10 flex shrink-0 items-center border-r bg-background px-1" style={{ width: HEADER_W }}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="xs" className="text-muted-foreground">
              <Plus /> Add track
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {ADDABLE.map(({ role, label }) => {
              const Icon = ROLE_ICONS[role];
              return (
                <DropdownMenuItem key={role} onSelect={() => store.apply((t) => addTrack(t, role).timeline)}>
                  <Icon /> {label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex-1" />
    </div>
  );
}

// ---------------------------------------------------------------------------

const AUDIO_COLORS: Record<string, { box: string; wave: string }> = {
  voice: { box: "bg-sky-500/15 border-sky-400/60", wave: "#7dd3fc" },
  music: { box: "bg-emerald-500/15 border-emerald-400/60", wave: "#6ee7b7" },
  ambience: { box: "bg-teal-500/15 border-teal-400/60", wave: "#5eead4" },
  sfx: { box: "bg-amber-500/15 border-amber-400/60", wave: "#fcd34d" },
  other: { box: "bg-slate-500/20 border-slate-400/50", wave: "#cbd5e1" },
};

const ClipView = memo(function ClipView(props: {
  clip: Clip;
  track: Track;
  zoom: number;
  height: number;
  selected: boolean;
  asset: MediaAsset | undefined;
  missing: boolean;
  onPointerDown: (e: React.PointerEvent, clip: Clip, mode: DragMode) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onDoubleClick: () => void;
}) {
  const { clip, track, zoom, height, selected, asset, missing } = props;
  const width = Math.max(4, clip.duration * zoom);
  const inner = height - 8;
  const audioColor = AUDIO_COLORS[track.role] ?? AUDIO_COLORS.other!;
  const isText = clip.kind === "caption" || clip.kind === "title";
  const box =
    clip.kind === "audio"
      ? audioColor.box
      : clip.kind === "scene"
        ? "bg-violet-500/20 border-violet-400/70"
        : clip.kind === "caption"
          ? "bg-indigo-500/15 border-indigo-400/60"
          : clip.kind === "title"
            ? "bg-rose-500/15 border-rose-400/60"
            : "bg-zinc-700/70 border-zinc-500";
  const pip = clip.layout.default !== null || Object.values(clip.layout.byRatio).some(Boolean);

  const handle = (mode: DragMode) => (
    <div
      className={cn("absolute top-0 bottom-0 z-10 w-2 cursor-ew-resize", mode === "trim-start" ? "left-0" : "right-0", "hover:bg-foreground/15")}
      onPointerDown={(e) => props.onPointerDown(e, clip, mode)}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
    />
  );

  return (
    <div
      className={cn(
        "group absolute top-1 cursor-grab overflow-hidden rounded-md border select-none active:cursor-grabbing",
        box,
        selected && "ring-2 ring-brand ring-offset-1 ring-offset-background",
        missing && "border-destructive bg-destructive-soft",
        (track.muted || track.hidden) && "opacity-50",
      )}
      style={{ left: clip.start * zoom, width, height: inner }}
      onPointerDown={(e) => props.onPointerDown(e, clip, "move")}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onDoubleClick={props.onDoubleClick}
      title={`${clip.label || clip.text || clip.src || clip.component || clip.kind} — ${formatClock(clip.start)} (${clip.duration.toFixed(1)} s)`}
    >
      {clip.kind === "audio" && asset?.waveformKey ? (
        <div className="absolute inset-x-0 bottom-0 top-3.5">
          <Waveform assetId={asset.id} sourceStart={clip.sourceStart} duration={clip.duration} width={width} height={inner - 16} color={audioColor.wave} />
        </div>
      ) : null}
      {clip.kind === "video" && asset?.filmstripKey && asset.durationSeconds ? (
        <Filmstrip assetId={asset.id} frames={asset.filmstripFrames} sourceDuration={asset.durationSeconds} sourceStart={clip.sourceStart} zoom={zoom} width={width} height={inner} />
      ) : null}
      {(clip.kind === "image" || (clip.kind === "video" && !asset?.filmstripKey)) && asset?.thumbnailKey ? (
        <div
          className="pointer-events-none absolute inset-0 bg-repeat-x"
          style={{ backgroundImage: `url(${mediaUrl(asset.id, "thumb")})`, backgroundSize: `auto ${inner}px` }}
          aria-hidden
        />
      ) : null}
      {clip.kind === "scene" ? (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate px-1.5 pb-1 text-[10px] text-violet-200/80">{clip.component}</span>
      ) : null}
      {isText ? <span className="absolute inset-0 truncate px-2 py-1 font-[family-name:var(--font-bangla)] text-[11px] leading-5">{clip.text}</span> : null}
      {!isText ? (
        <span className="pointer-events-none absolute top-0 left-0 flex max-w-full items-center gap-1 truncate rounded-br bg-background/85 px-1.5 text-[10px] leading-4 font-medium">
          {missing ? "Missing file" : clip.label || clip.kind}
          {pip ? <span className="rounded bg-brand px-1 text-[9px] text-brand-foreground">PiP</span> : null}
        </span>
      ) : null}
      {clip.transition !== "none" && clip.kind !== "audio" ? (
        <span className="pointer-events-none absolute bottom-0 left-0 h-full w-2 bg-gradient-to-r from-foreground/25 to-transparent" />
      ) : null}
      {handle("trim-start")}
      {handle("trim-end")}
    </div>
  );
});
