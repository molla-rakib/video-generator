"use client";

import { useEffect, useMemo, useRef } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { Maximize, Pause, Play, SkipBack } from "lucide-react";
import { Documentary, type DocumentaryProps, type MediaRef } from "@studio/renderer";
import { formatClock, timelineDuration } from "@studio/timeline";
import { Button } from "@/components/ui/button";
import { mediaUrl, useEditorContext } from "./context";
import { useEditor, usePlayhead } from "./store";

/** The preview monitor: the real composition, played in the browser. */
export function Preview() {
  const { store, playhead, mediaById } = useEditorContext();
  const timeline = useEditor(store, (s) => s.draft ?? s.timeline);
  const playerRef = useRef<PlayerRef>(null);
  const fps = timeline.fps;
  const duration = timelineDuration(timeline);
  const durationInFrames = Math.max(1, Math.ceil(duration * fps));

  const media = useMemo(() => {
    const map: Record<string, MediaRef> = {};
    for (const [id, a] of mediaById) {
      if (a.status === "ready" && (a.kind === "audio" || a.kind === "image" || a.kind === "video")) map[id] = { url: mediaUrl(id), kind: a.kind };
    }
    return map;
  }, [mediaById]);

  const inputProps: DocumentaryProps = useMemo(() => ({ timeline, media, fps }), [timeline, media, fps]);

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
  }, [playhead, fps, durationInFrames]);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-surface" aria-label="Preview">
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <div className="relative h-full w-full overflow-hidden rounded-lg bg-black shadow-sm ring-1 ring-border">
          <Player
            ref={playerRef}
            component={Documentary}
            inputProps={inputProps}
            durationInFrames={durationInFrames}
            compositionWidth={timeline.width}
            compositionHeight={timeline.height}
            fps={fps}
            style={{ width: "100%", height: "100%" }}
            controls={false}
            clickToPlay
            doubleClickToFullscreen
            spaceKeyToPlayOrPause={false}
            moveToBeginningWhenEnded={false}
            errorFallback={({ error }) => (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-white/80">
                Preview problem: {error.message}
              </div>
            )}
          />
          {timeline.clips.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-sm text-white/70">
              <span className="font-medium text-white">Nothing on the timeline yet</span>
              <span>Write a script and generate narration, or drag media onto the timeline.</span>
            </div>
          ) : null}
        </div>
      </div>
      <PreviewControls duration={duration} onFullscreen={() => playerRef.current?.requestFullscreen()} />
    </section>
  );
}

function PreviewControls({ duration, onFullscreen }: { duration: number; onFullscreen: () => void }) {
  const { playhead, store } = useEditorContext();
  const { time, playing } = usePlayhead(playhead);
  const aspect = useEditor(store, (s) => `${s.timeline.width}×${s.timeline.height}`);
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
      <span className="hidden text-xs text-muted-foreground sm:inline">{aspect}</span>
      <Button variant="ghost" size="icon-sm" aria-label="Full screen" onClick={onFullscreen}>
        <Maximize />
      </Button>
    </div>
  );
}
