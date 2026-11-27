"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { Maximize, Pause, Play, SkipBack } from "lucide-react";
import { BASE_RESOLUTION, Video, type VideoProps } from "@studio/renderer";
import { dimensionsFor } from "@studio/shared";
import { boxFor, formatClock, setClipLayout, timelineDuration, TRACK_FOR_CLIP, type Box, type Clip } from "@studio/timeline";
import { Button } from "@/components/ui/button";
import { useEditorContext } from "./context";
import { StartAnimating } from "./start-animating";
import { useEditor, usePlayhead } from "./store";

/** The preview monitor: the real composition, played in the browser. */
export function Preview() {
  const { project, store, playhead, fileVersions } = useEditorContext();
  const timeline = useEditor(store, (s) => s.draft ?? s.timeline);
  const playerRef = useRef<PlayerRef>(null);
  const fps = timeline.fps;
  const duration = timelineDuration(timeline);
  const durationInFrames = Math.max(1, Math.ceil(duration * fps));
  const { width, height } = dimensionsFor(timeline.ratio, BASE_RESOLUTION);

  const versions = useMemo(() => {
    const v: Record<string, string> = {};
    for (const [path, version] of Object.entries(fileVersions)) if (version) v[path] = version;
    return v;
  }, [fileVersions]);

  const inputProps: VideoProps = useMemo(
    () => ({
      timeline,
      ratio: timeline.ratio,
      fileBase: `/api/projects/${project.id}/files/`,
      sceneBase: `/api/projects/${project.id}/scene/`,
      versions,
      fps,
    }),
    [timeline, versions, fps, project.id],
  );

  // Where the video actually sits inside the monitor (it is letterboxed).
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setArea({ w: entry!.contentRect.width, h: entry!.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = area.w && area.h ? Math.min(area.w / width, area.h / height) : 0;
  const frameRect = { w: width * scale, h: height * scale, x: (area.w - width * scale) / 2, y: (area.h - height * scale) / 2 };
  const playerMounted = scale > 0;

  // Connect the player to the shared playhead.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = (e: { detail: { frame: number } }) => playhead.update(e.detail.frame / fps);
    const onPlay = () => playhead.update(playhead.time, true);
    const onPause = () => playhead.update(playhead.time, false);
    player.addEventListener("frameupdate", onFrame);
    player.addEventListener("seeked", onFrame);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onPause);
    playhead.setControls({
      seek: (s) => player.seekTo(Math.min(durationInFrames - 1, Math.round(s * fps))),
      toggle: () => player.toggle(),
    });
    return () => {
      player.removeEventListener("frameupdate", onFrame);
      player.removeEventListener("seeked", onFrame);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("ended", onPause);
    };
  }, [playhead, fps, durationInFrames, playerMounted]);

  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-surface" aria-label="Preview">
      <StartAnimating />
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <div ref={areaRef} className="relative h-full w-full">
          <div
            className="absolute overflow-hidden rounded-md bg-black shadow-sm ring-1 ring-border"
            style={{ left: frameRect.x, top: frameRect.y, width: frameRect.w, height: frameRect.h }}
          >
            {playerMounted ? (
              <Player
                ref={playerRef}
                component={Video}
                inputProps={inputProps}
                durationInFrames={durationInFrames}
                compositionWidth={width}
                compositionHeight={height}
                fps={fps}
                style={{ width: "100%", height: "100%" }}
                controls={false}
                clickToPlay={false}
                doubleClickToFullscreen
                spaceKeyToPlayOrPause={false}
                moveToBeginningWhenEnded={false}
                errorFallback={({ error }) => (
                  <div className="flex h-full items-center justify-center p-6 text-center text-sm text-white/80">Preview problem: {error.message}</div>
                )}
              />
            ) : null}
            {timeline.clips.length === 0 ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 p-4 text-center text-sm text-white/70">
                <span className="font-medium text-white">Nothing on the timeline yet</span>
                <span>Drag your own video, pictures or sound from the Media panel onto the timeline.</span>
              </div>
            ) : null}
            <LayoutHandles frame={{ w: frameRect.w, h: frameRect.h }} />
          </div>
        </div>
      </div>
      <PreviewControls duration={duration} onFullscreen={() => playerRef.current?.requestFullscreen()} />
    </section>
  );
}

/**
 * Move / resize the selected picture-in-picture clip directly on the video.
 * Changes apply to the shape being edited when it has its own layout,
 * otherwise to the default layout used by every shape.
 */
function LayoutHandles({ frame }: { frame: { w: number; h: number } }) {
  const { store, playhead } = useEditorContext();
  const timeline = useEditor(store, (s) => s.draft ?? s.timeline);
  const selected = useEditor(store, (s) => s.selected);
  const { time } = usePlayhead(playhead);
  const drag = useRef<{ mode: "move" | "resize"; x: number; y: number; box: Box; clip: Clip } | null>(null);

  const clip = timeline.clips.find((c) => c.id === selected[0]);
  if (!clip || TRACK_FOR_CLIP[clip.kind] !== "video" || selected.length !== 1) return null;
  const box = boxFor(clip, timeline.ratio);
  const visibleNow = time >= clip.start && time < clip.start + clip.duration;
  if (!box) {
    return visibleNow ? <div className="pointer-events-none absolute inset-0 ring-2 ring-brand ring-inset" /> : null;
  }
  const target = clip.layout.byRatio[timeline.ratio] !== undefined ? timeline.ratio : "default";

  const onDown = (e: React.PointerEvent, mode: "move" | "resize") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, box, clip };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / frame.w;
    const dy = (e.clientY - d.y) / frame.h;
    let next: Box;
    if (d.mode === "move") {
      next = { ...d.box, x: clamp(d.box.x + dx, -d.box.w + 0.05, 0.95), y: clamp(d.box.y + dy, -d.box.h + 0.05, 0.95) };
    } else {
      // Keep the shape: scale by the larger of the two drags.
      const factor = Math.max((d.box.w + dx) / d.box.w, (d.box.h + dy) / d.box.h);
      const f = clamp(factor, 0.1 / d.box.w, 1.5 / Math.max(d.box.w, d.box.h));
      next = { ...d.box, w: d.box.w * f, h: d.box.h * f };
    }
    next = { ...next, x: round(next.x), y: round(next.y), w: round(next.w), h: round(next.h) };
    try {
      store.setDraft(setClipLayout(store.getSnapshot().timeline, d.clip.id, target, next));
    } catch {
      // locked track — ignore
    }
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const draft = store.getSnapshot().draft;
    if (draft) store.apply(() => draft);
  };

  return (
    <div
      className="absolute cursor-move touch-none ring-2 ring-brand"
      style={{
        left: box.x * frame.w,
        top: box.y * frame.h,
        width: box.w * frame.w,
        height: box.h * frame.h,
        borderRadius: box.radius * Math.min(box.w * frame.w, box.h * frame.h),
        opacity: visibleNow ? 1 : 0.5,
      }}
      onPointerDown={(e) => onDown(e, "move")}
      onPointerMove={onMove}
      onPointerUp={onUp}
      title="Drag to move. Drag the corner to resize."
    >
      <div
        className="absolute -right-1.5 -bottom-1.5 size-3.5 cursor-nwse-resize rounded-sm border-2 border-white bg-brand shadow"
        onPointerDown={(e) => onDown(e, "resize")}
        onPointerMove={onMove}
        onPointerUp={onUp}
      />
    </div>
  );
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number) => Math.round(v * 1000) / 1000;

function PreviewControls({ duration, onFullscreen }: { duration: number; onFullscreen: () => void }) {
  const { playhead, store } = useEditorContext();
  const { time, playing } = usePlayhead(playhead);
  const ratio = useEditor(store, (s) => s.timeline.ratio);
  return (
    <div className="flex items-center gap-2 border-t bg-background px-3 py-2">
      <Button variant="ghost" size="icon-sm" aria-label="Back to start" onClick={() => playhead.seek(0)}>
        <SkipBack />
      </Button>
      <Button size="icon-sm" aria-label={playing ? "Pause" : "Play"} onClick={() => playhead.controls?.toggle()}>
        {playing ? <Pause /> : <Play />}
      </Button>
      <span className="w-24 text-xs tabular-nums text-muted-foreground">
        {formatClock(time)} / {formatClock(duration)}
      </span>
      <input
        type="range"
        min={0}
        max={duration}
        step={0.01}
        value={Math.min(time, duration)}
        onChange={(e) => playhead.seek(Number(e.target.value))}
        className="h-1 flex-1 cursor-pointer accent-[var(--brand)]"
        aria-label="Scrub"
      />
      <span className="hidden text-xs text-muted-foreground sm:inline">{ratio}</span>
      <Button variant="ghost" size="icon-sm" aria-label="Full screen" onClick={onFullscreen}>
        <Maximize />
      </Button>
    </div>
  );
}
