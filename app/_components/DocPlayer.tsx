"use client";

import { Player, Thumbnail, type PlayerRef } from "@remotion/player";
import { useEffect, type CSSProperties, type RefObject } from "react";
import type { DocProps } from "@/remotion/DocFromSpec";
import { DocFromSpec } from "@/remotion/DocFromSpec";

type Props = {
  inputProps: DocProps;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  initialFrame?: number;
  /** Passed as a plain prop (not `ref`) so it survives the next/dynamic wrapper. */
  playerRef?: RefObject<PlayerRef | null>;
  onFrame?: (frame: number) => void;
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  style?: CSSProperties;
  /** Show this frame as a poster until the viewer presses play (e.g. the finished title). */
  posterFrame?: number;
};

/**
 * Remotion Player. Browser-only (it reads the clock during render), so it is
 * always loaded with `next/dynamic({ ssr: false })` and never prerendered.
 */
export default function DocPlayer({ inputProps, durationInFrames, fps, width, height, initialFrame = 0, playerRef, onFrame, controls = true, autoPlay, loop, style, posterFrame }: Props) {
  useEffect(() => {
    const player = playerRef?.current;
    if (!player || !onFrame) return;
    const handler = (e: { detail: { frame: number } }) => onFrame(e.detail.frame);
    player.addEventListener("frameupdate", handler);
    return () => player.removeEventListener("frameupdate", handler);
  }, [playerRef, onFrame]);

  return (
    <Player
      ref={playerRef}
      component={DocFromSpec}
      inputProps={inputProps}
      durationInFrames={durationInFrames}
      fps={fps}
      compositionWidth={width}
      compositionHeight={height}
      style={{ width: "100%", height: "100%", ...style }}
      controls={controls}
      clickToPlay={controls}
      autoPlay={autoPlay}
      loop={loop}
      acknowledgeRemotionLicense
      initialFrame={initialFrame}
      posterFillMode="player-size"
      showPosterWhenUnplayed={posterFrame !== undefined}
      renderPoster={
        posterFrame !== undefined
          ? () => <DocThumb inputProps={inputProps} frame={posterFrame} durationInFrames={durationInFrames} fps={fps} width={width} height={height} />
          : undefined
      }
    />
  );
}

/** A single still frame of a video (used for scene strips and gallery cards). */
export function DocThumb({ inputProps, frame, durationInFrames, fps, width, height }: Omit<Props, "playerRef" | "onFrame" | "initialFrame"> & { frame: number }) {
  return (
    <Thumbnail
      component={DocFromSpec}
      inputProps={inputProps}
      frameToDisplay={frame}
      durationInFrames={durationInFrames}
      fps={fps}
      compositionWidth={width}
      compositionHeight={height}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
