import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/NotoSansBengali";
import type { Clip, Timeline } from "@studio/timeline";

/**
 * The documentary composition. It only COMPOSES existing media — images,
 * video, audio and text — positioned by the shared timeline. It does not
 * create footage.
 */

const { fontFamily: bengaliFont } = loadFont("normal", { weights: ["500", "700"], subsets: ["bengali", "latin"] });

export interface MediaRef {
  url: string;
  kind: "audio" | "image" | "video";
}

export interface DocumentaryProps extends Record<string, unknown> {
  timeline: Timeline;
  media: Record<string, MediaRef>;
  /** Frame rate to render at (may differ from the editing fps). */
  fps: number;
}

const toFrames = (seconds: number, fps: number) => Math.round(seconds * fps);

function fadeEnvelope(frame: number, durationFrames: number, fadeInFrames: number, fadeOutFrames: number): number {
  let v = 1;
  if (fadeInFrames > 0) v = Math.min(v, interpolate(frame, [0, fadeInFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  if (fadeOutFrames > 0) {
    v = Math.min(
      v,
      interpolate(frame, [durationFrames - fadeOutFrames, durationFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    );
  }
  return v;
}

function motionTransform(clip: Clip, progress: number): string {
  const s = clip.motionStrength;
  const zoom = 1 + 0.25 * s;
  const pan = 6 * s; // percent
  switch (clip.motion) {
    case "zoom_in":
      return `scale(${1 + (zoom - 1) * progress})`;
    case "zoom_out":
      return `scale(${zoom - (zoom - 1) * progress})`;
    case "pan_left":
      return `scale(${1 + pan / 50}) translateX(${pan - 2 * pan * progress}%)`;
    case "pan_right":
      return `scale(${1 + pan / 50}) translateX(${-pan + 2 * pan * progress}%)`;
    case "pan_up":
      return `scale(${1 + pan / 50}) translateY(${pan - 2 * pan * progress}%)`;
    case "pan_down":
      return `scale(${1 + pan / 50}) translateY(${-pan + 2 * pan * progress}%)`;
    default:
      return "none";
  }
}

function transitionStyle(clip: Clip, frame: number, fps: number): React.CSSProperties {
  if (clip.transition === "none") return {};
  const frames = Math.max(1, toFrames(clip.transitionDuration, fps));
  const t = interpolate(frame, [0, frames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  switch (clip.transition) {
    case "fade":
      return { opacity: t };
    case "slide_left":
      return { transform: `translateX(${(1 - t) * 100}%)` };
    case "slide_up":
      return { transform: `translateY(${(1 - t) * 100}%)` };
    case "wipe":
      return { clipPath: `inset(0 ${(1 - t) * 100}% 0 0)` };
    case "zoom":
      return { opacity: t, transform: `scale(${1.15 - 0.15 * t})` };
  }
}

const VisualClip: React.FC<{ clip: Clip; media: MediaRef; muted: boolean }> = ({ clip, media, muted }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationFrames = Math.max(1, toFrames(clip.duration, fps));
  const progress = Math.min(1, frame / durationFrames);
  const opacity = fadeEnvelope(frame, durationFrames, toFrames(clip.fadeIn, fps), toFrames(clip.fadeOut, fps));
  const mediaStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: clip.fit,
    transform: motionTransform(clip, progress),
  };
  return (
    <AbsoluteFill style={{ overflow: "hidden", opacity, ...transitionStyle(clip, frame, fps) }}>
      {media.kind === "image" ? (
        <Img src={media.url} style={mediaStyle} />
      ) : (
        <OffthreadVideo
          src={media.url}
          style={mediaStyle}
          trimBefore={toFrames(clip.sourceStart, fps)}
          muted={muted || clip.volume === 0}
          volume={(f) => clip.volume * fadeEnvelope(f, durationFrames, toFrames(clip.fadeIn, fps), toFrames(clip.fadeOut, fps))}
        />
      )}
    </AbsoluteFill>
  );
};

const AudioClip: React.FC<{ clip: Clip; media: MediaRef }> = ({ clip, media }) => {
  const { fps } = useVideoConfig();
  const durationFrames = Math.max(1, toFrames(clip.duration, fps));
  const fadeIn = toFrames(clip.fadeIn, fps);
  const fadeOut = toFrames(clip.fadeOut, fps);
  return (
    <Audio
      src={media.url}
      trimBefore={toFrames(clip.sourceStart, fps)}
      volume={(f) => clip.volume * fadeEnvelope(f, durationFrames, fadeIn, fadeOut)}
    />
  );
};

const TextClip: React.FC<{ clip: Clip; width: number; height: number }> = ({ clip, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationFrames = Math.max(1, toFrames(clip.duration, fps));
  const opacity = fadeEnvelope(frame, durationFrames, Math.min(6, durationFrames / 4), Math.min(6, durationFrames / 4));
  const base = Math.min(width, height);
  if (clip.kind === "title") {
    return (
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity, padding: base * 0.08 }}>
        <div
          style={{
            fontFamily: bengaliFont,
            fontWeight: 700,
            fontSize: base * 0.075,
            lineHeight: 1.35,
            color: "white",
            textAlign: "center",
            textShadow: "0 2px 18px rgba(0,0,0,0.6)",
          }}
        >
          {clip.text}
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: height * 0.07, paddingInline: width * 0.08, opacity }}>
      <div
        style={{
          fontFamily: bengaliFont,
          fontWeight: 500,
          fontSize: base * 0.045,
          lineHeight: 1.5,
          color: "white",
          textAlign: "center",
          background: "rgba(0,0,0,0.55)",
          borderRadius: base * 0.01,
          padding: `${base * 0.008}px ${base * 0.02}px`,
          maxWidth: "100%",
          // Bangla words should not be split mid-word.
          wordBreak: "keep-all",
          overflowWrap: "break-word",
        }}
      >
        {clip.text}
      </div>
    </AbsoluteFill>
  );
};

export const Documentary: React.FC<DocumentaryProps> = ({ timeline, media }) => {
  const { fps, width, height } = useVideoConfig();
  const sequence = (clip: Clip, child: React.ReactNode) => (
    <Sequence
      key={clip.id}
      from={toFrames(clip.start, fps)}
      durationInFrames={Math.max(1, toFrames(clip.duration, fps))}
      premountFor={fps}
      name={clip.label || clip.kind}
    >
      {child}
    </Sequence>
  );

  // Higher tracks in the editor are drawn in front, so render bottom-up.
  const visualTracks = timeline.tracks.filter((t) => t.kind === "video" && !t.hidden).reverse();
  const audioTracks = timeline.tracks.filter((t) => t.kind === "audio" && !t.muted);
  const textTracks = timeline.tracks.filter((t) => t.kind === "text" && !t.hidden).reverse();

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {visualTracks.map((track) => (
        <AbsoluteFill key={track.id}>
          {timeline.clips
            .filter((c) => c.trackId === track.id && c.assetId && media[c.assetId])
            .map((clip) => sequence(clip, <VisualClip clip={clip} media={media[clip.assetId!]!} muted={track.muted} />))}
        </AbsoluteFill>
      ))}
      {audioTracks.map((track) =>
        timeline.clips
          .filter((c) => c.trackId === track.id && c.assetId && media[c.assetId])
          .map((clip) => sequence(clip, <AudioClip clip={clip} media={media[clip.assetId!]!} />)),
      )}
      {textTracks.map((track) => (
        <AbsoluteFill key={track.id}>
          {timeline.clips
            .filter((c) => c.trackId === track.id && c.text.trim())
            .map((clip) => sequence(clip, <TextClip clip={clip} width={width} height={height} />))}
        </AbsoluteFill>
      ))}
    </AbsoluteFill>
  );
};

/** Composition size, frame rate and length for a timeline. */
export function compositionMetadata(props: Pick<DocumentaryProps, "timeline" | "fps">) {
  const end = props.timeline.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  return {
    durationInFrames: Math.max(1, Math.ceil(Math.max(1, end) * props.fps)),
    fps: props.fps,
    width: props.timeline.width,
    height: props.timeline.height,
  };
}
