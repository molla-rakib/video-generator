"use client";

import { memo, useEffect, useRef } from "react";
import {
  Copy,
  Eye,
  EyeOff,
  Film,
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
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import type { MediaAsset } from "@studio/database";
import {
  addClip,
  addTrack,
  defaultTrackFor,
  deleteClips,
  duplicateClip,
  formatClock,
  isAudioTrackLocked,
  moveClip,
  removeTrack,
  snapTime,
  splitClip,
  timelineDuration,
  TRACK_FOR_CLIP,
  trimClipEnd,
  trimClipStart,
  updateTrack,
  type Clip,
  type Timeline,
  type Track,
} from "@studio/timeline";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { mediaUrl, useEditorContext } from "../context";
import { useEditor, usePlayhead } from "../store";
import { Filmstrip, Waveform } from "./waveform";

export const ASSET_DRAG_TYPE = "application/x-studio-asset";
const HEADER_W = 176;
const RULER_H = 28;
const trackHeight = (t: Track) => (t.kind === "text" ? 40 : 58);

type DragMode = "move" | "trim-start" | "trim-end";

export function TimelineView() {
  const { store, playhead, mediaById, inspect } = useEditorContext();
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
    if (e.shiftKey) {
      const cur = store.getSnapshot().selected;
      store.select(cur.includes(clip.id) ? cur.filter((i) => i !== clip.id) : [...cur, clip.id]);
      return;
    }
    if (!store.getSnapshot().selected.includes(clip.id)) store.select([clip.id]);
    if (track && isAudioTrackLocked(base, track)) return; // selectable, not movable
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { clipId: clip.id, mode, startX: e.clientX, origin: clip, base, moved: false };
  }

  function onClipPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.startX) < 3) return;
    d.moved = true;
    const dx = (e.clientX - d.startX) / zoom;
    const snapT = (t: number) =>
      snap ? snapTime(d.base, t, { threshold: 8 / zoom, excludeClipId: d.clipId, extra: [playhead.time] }) : t;
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
    let at = timeAt(e.clientX);
    if (snap) at = snapTime(store.getSnapshot().timeline, at, { threshold: 8 / zoom, extra: [playhead.time] });
    placeAsset(asset, at, track);
  }

  function placeAsset(asset: MediaAsset, at: number, preferred?: Track) {
    if (asset.status !== "ready") return toast.error("This file is still being prepared. Try again in a moment.");
    if (asset.kind === "render") return toast.error("Rendered videos can't be added to the timeline.");
    const kind = asset.kind === "image" ? "image" : asset.kind === "video" ? "video" : "audio";
    store.apply((t) => {
      let next = t;
      const want = TRACK_FOR_CLIP[kind];
      let track = preferred && preferred.kind === want ? preferred : defaultTrackFor(next, kind, asset.role);
      if (!track) ({ timeline: next, track } = addTrack(next, want));
      return addClip(next, {
        trackId: track.id,
        kind,
        assetId: asset.id,
        label: asset.name,
        start: at,
        duration: kind === "image" ? 5 : (asset.durationSeconds ?? 5),
        sourceDuration: kind === "image" ? null : asset.durationSeconds,
        motion: kind === "image" ? "zoom_in" : "none",
        transition: kind === "audio" ? "none" : "fade",
        volume: asset.role === "music" ? 0.3 : 1,
        sceneId: asset.sceneId,
      }).timeline;
    });
  }

  return (
    <section className="flex h-[310px] shrink-0 flex-col border-t" aria-label="Timeline">
      <TimelineToolbar duration={duration} onFit={() => {
        const w = scrollRef.current?.clientWidth ?? 800;
        store.setZoom((w - HEADER_W - 40) / Math.max(duration, 5));
      }} />
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
                <div
                  key={m.id}
                  className="absolute top-0 flex h-full items-start"
                  style={{ left: m.time * zoom }}
                  title={m.label}
                >
                  <div className="h-full w-px bg-brand" />
                  <span className="max-w-36 truncate rounded-r bg-brand px-1 text-[10px] leading-4 font-medium text-brand-foreground">{m.label}</span>
                </div>
              ))}
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
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  store.select([]);
                  playhead.seek(timeAt(e.clientX));
                }}
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
                  .map((clip) => (
                    <ClipView
                      key={clip.id}
                      clip={clip}
                      track={track}
                      zoom={zoom}
                      height={trackHeight(track)}
                      selected={selected.includes(clip.id)}
                      asset={clip.assetId ? mediaById.get(clip.assetId) : undefined}
                      onPointerDown={onClipPointerDown}
                      onPointerMove={onClipPointerMove}
                      onPointerUp={onClipPointerUp}
                      onDoubleClick={() => inspect(clip.id)}
                    />
                  ))}
              </div>
            </div>
          ))}
          <AddTrackRow />
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
  const audioLocked = useEditor(store, (s) => Boolean(s.timeline.audioLockedAt));
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
      {tool("Split at playhead (S)", <Scissors />, () => {
        const id = selected[0];
        if (!id) return toast.message("Select a clip, put the playhead inside it, then split.");
        store.apply((t) => splitClip(t, id, playhead.time).timeline);
      }, { disabled: selected.length !== 1 })}
      {tool("Duplicate", <Copy />, () => store.apply((t) => duplicateClip(t, selected[0]!).timeline), { disabled: selected.length !== 1 })}
      {tool("Delete (Del)", <Trash2 />, () => store.apply((t) => deleteClips(t, selected)), { disabled: selected.length === 0 })}
      <div className="mx-1 h-5 w-px bg-border" />
      {tool(snap ? "Snapping on" : "Snapping off", <Magnet />, store.toggleSnap, { active: snap })}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={audioLocked ? "secondary" : "ghost"}
            size="sm"
            onClick={() =>
              store.apply((t) => ({ ...t, audioLockedAt: t.audioLockedAt ? null : new Date().toISOString() }), {
                snapshot: audioLocked ? undefined : "Audio locked",
              })
            }
          >
            {audioLocked ? <Lock /> : <LockOpen />} {audioLocked ? "Audio locked" : "Lock audio"}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-60">
          {audioLocked ? "Click to unlock and change the soundtrack again." : "When the soundtrack is final, lock it so visuals can be fitted to it without accidental changes."}
        </TooltipContent>
      </Tooltip>
      <span className="ml-2 text-xs tabular-nums text-muted-foreground">
        {formatClock(time)} / {formatClock(duration)}
      </span>
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

function PlayheadLine({ zoom, scrollRef }: { zoom: number; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const { playhead } = useEditorContext();
  const { time, playing } = usePlayhead(playhead);
  const x = HEADER_W + time * zoom;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft + HEADER_W) el.scrollLeft = x - HEADER_W - 60;
  }, [x, playing, scrollRef]);
  return (
    <div className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-destructive" style={{ left: x }}>
      <div className="sticky top-0 -ml-1.5 size-3 rotate-45 bg-destructive" />
    </div>
  );
}

function TrackHeader({ track, timeline }: { track: Track; timeline: Timeline }) {
  const { store } = useEditorContext();
  const Icon = track.kind === "video" ? Film : track.kind === "audio" ? Music : Type;
  const locked = isAudioTrackLocked(timeline, track);
  const empty = !timeline.clips.some((c) => c.trackId === track.id);
  return (
    <div className="sticky left-0 z-10 flex shrink-0 items-center gap-1 border-r bg-background px-2" style={{ width: HEADER_W }}>
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
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => store.apply((t) => updateTrack(t, track.id, { muted: !track.muted }))}
          aria-label={track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`}
        >
          {track.muted ? <VolumeX className="size-3.5 text-destructive" /> : <Volume2 className="size-3.5" />}
        </button>
      ) : (
        <button
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => store.apply((t) => updateTrack(t, track.id, { hidden: !track.hidden }))}
          aria-label={track.hidden ? `Show ${track.name}` : `Hide ${track.name}`}
        >
          {track.hidden ? <EyeOff className="size-3.5 text-destructive" /> : <Eye className="size-3.5" />}
        </button>
      )}
      <button
        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => store.apply((t) => updateTrack(t, track.id, { locked: !track.locked }))}
        aria-label={track.locked ? `Unlock ${track.name}` : `Lock ${track.name}`}
        title={locked && !track.locked ? "Locked because the audio is locked" : undefined}
      >
        {locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5 opacity-40" />}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label={`More for ${track.name}`}>
            <MoreVertical className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem variant="destructive" disabled={!empty} onSelect={() => store.apply((t) => removeTrack(t, track.id))}>
            Remove track{empty ? "" : " (not empty)"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

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
            <DropdownMenuItem onSelect={() => store.apply((t) => addTrack(t, "video").timeline)}>
              <Film /> Video track
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => store.apply((t) => addTrack(t, "audio", { name: "Ambience", role: "ambience" }).timeline)}>
              <Music /> Audio track
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => store.apply((t) => addTrack(t, "text", { name: "Titles" }).timeline)}>
              <Type /> Text track
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex-1" />
    </div>
  );
}

// ---------------------------------------------------------------------------

const AUDIO_COLORS: Record<string, { box: string; wave: string }> = {
  narration: { box: "bg-sky-50 border-sky-300", wave: "#0284c7" },
  dialogue: { box: "bg-violet-50 border-violet-300", wave: "#7c3aed" },
  music: { box: "bg-emerald-50 border-emerald-300", wave: "#059669" },
  ambience: { box: "bg-teal-50 border-teal-300", wave: "#0d9488" },
  sfx: { box: "bg-amber-50 border-amber-300", wave: "#d97706" },
};

const ClipView = memo(function ClipView(props: {
  clip: Clip;
  track: Track;
  zoom: number;
  height: number;
  selected: boolean;
  asset: MediaAsset | undefined;
  onPointerDown: (e: React.PointerEvent, clip: Clip, mode: DragMode) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onDoubleClick: () => void;
}) {
  const { clip, track, zoom, height, selected, asset } = props;
  const width = Math.max(4, clip.duration * zoom);
  const inner = height - 8;
  const audioColor = AUDIO_COLORS[track.role ?? asset?.role ?? "narration"] ?? AUDIO_COLORS.narration!;
  const missing = Boolean(clip.assetId) && !asset;
  const box =
    clip.kind === "audio"
      ? audioColor.box
      : clip.kind === "subtitle"
        ? "bg-indigo-50 border-indigo-300"
        : clip.kind === "title"
          ? "bg-rose-50 border-rose-300"
          : "bg-neutral-200 border-neutral-400";

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
        selected && "ring-2 ring-brand ring-offset-1",
        missing && "border-destructive bg-destructive-soft",
        (track.muted || track.hidden) && "opacity-50",
      )}
      style={{ left: clip.start * zoom, width, height: inner }}
      onPointerDown={(e) => props.onPointerDown(e, clip, "move")}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onDoubleClick={props.onDoubleClick}
      title={`${clip.label || clip.text || clip.kind} — ${formatClock(clip.start)} (${clip.duration.toFixed(1)} s)`}
    >
      {clip.kind === "audio" && asset?.waveformKey ? (
        <div className="absolute inset-x-0 bottom-0 top-3.5">
          <Waveform assetId={asset.id} sourceStart={clip.sourceStart} duration={clip.duration} width={width} height={inner - 16} color={audioColor.wave} />
        </div>
      ) : null}
      {clip.kind === "video" && asset?.filmstripKey && asset.durationSeconds ? (
        <Filmstrip assetId={asset.id} frames={asset.filmstripFrames} sourceDuration={asset.durationSeconds} sourceStart={clip.sourceStart} zoom={zoom} width={width} height={inner} />
      ) : null}
      {clip.kind === "image" && asset?.thumbnailKey ? (
        <div
          className="pointer-events-none absolute inset-0 bg-repeat-x"
          style={{ backgroundImage: `url(${mediaUrl(asset.id, "thumb")})`, backgroundSize: `auto ${inner}px` }}
          aria-hidden
        />
      ) : null}
      {(clip.kind === "subtitle" || clip.kind === "title") && (
        <span className="absolute inset-0 truncate px-2 py-1 font-[family-name:var(--font-bangla)] text-[11px] leading-5">{clip.text}</span>
      )}
      {clip.kind !== "subtitle" && clip.kind !== "title" ? (
        <span className="pointer-events-none absolute top-0 left-0 max-w-full truncate rounded-br bg-background/85 px-1.5 text-[10px] leading-4 font-medium">
          {missing ? "Missing file" : clip.label || clip.kind}
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
