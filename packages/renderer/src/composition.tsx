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
import { dimensionsFor, type AspectRatio } from "@studio/shared";
import { audibleTracks, boxFor, type Box, type CaptionStyle, type Clip, type Timeline } from "@studio/timeline";
import { SceneErrorBoundary, SceneProblem, useScene } from "./scene-loader";

/**
 * The video composition. It plays a project.json timeline:
 *   - scene clips: Remotion components written by the AI agent,
 *   - video / picture clips: full frame or placed in a box (picture-in-picture),
 *   - audio clips with clip × track volume, fades, mute and solo,
 *   - captions and titles.
 * The same component runs in the editor preview and in the export renderer.
 */

const { fontFamily: bengaliFont } = loadFont("normal", { weights: ["500", "700"], subsets: ["bengali", "latin"] });

export interface VideoProps extends Record<string, unknown> {
  timeline: Timeline;
  /** Which shape to compose for (picks per-ratio layouts and the frame size). */
  ratio: AspectRatio;
  /** URL prefix for project files: base + "audio/sfx/rain.mp3". */
  fileBase: string;
  /** URL prefix for compiled scene components: base + "scenes/Shot01.tsx". */
  sceneBase: string;
  /** Per-file version strings, so edited files are reloaded. */
  versions: Record<string, string>;
  /** Frame rate to render at (may differ from the editing fps). */
  fps: number;
}

/** Compositions are laid out at 1080p; exports scale from there. */
export const BASE_RESOLUTION = "1080p" as const;

const toFrames = (seconds: number, fps: number) => Math.round(seconds * fps);

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");
function urlFor(base: string, path: string, versions: Record<string, string>): string {
  const v = versions[path];
  return `${base}${encodePath(path)}${v ? `?v=${encodeURIComponent(v)}` : ""}`;
}

function fadeEnvelope(frame: number, durationFrames: number, fadeInFrames: number, fadeOutFrames: number): number {
  let v = 1;
  if (fadeInFrames > 0) v = Math.min(v, interpolate(frame, [0, fadeInFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  if (fadeOutFrames > 0) {
    v = Math.min(v, interpolate(frame, [durationFrames - fadeOutFrames, durationFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
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

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const bump = (t: number) => Math.sin(Math.PI * t); // 0 → 1 → 0

/** The incoming shot during its transition (t: 0 → 1). Drawn above the outgoing shot. */
function enterStyle(type: Clip["transition"], t: number): React.CSSProperties {
  const e = ease(t);
  switch (type) {
    case "none":
      return {};
    case "fade":
      return { opacity: t };
    case "morph":
      // The new shot condenses out of the old one: soft focus, slight scale, dissolve.
      return { opacity: e, transform: `scale(${1.07 - 0.07 * e})`, filter: `blur(${(1 - e) * 14}px) saturate(${1 + (1 - e) * 0.3})` };
    case "zoom_through":
      // The camera flies through the old shot into the new one.
      return { opacity: Math.min(1, t * 1.6), transform: `scale(${1.6 - 0.6 * e})`, filter: `blur(${(1 - e) * 10}px)` };
    case "whip":
      return { transform: `translateX(${(1 - e) * 100}%)`, filter: `blur(${bump(t) * 12}px)` };
    case "iris":
      return { clipPath: `circle(${e * 75}% at 50% 50%)` };
    case "slide_left":
      return { transform: `translateX(${(1 - e) * 100}%)` };
    case "slide_up":
      return { transform: `translateY(${(1 - e) * 100}%)` };
    case "wipe":
      return { clipPath: `inset(0 ${(1 - e) * 100}% 0 0)` };
    case "zoom":
      return { opacity: t, transform: `scale(${1.15 - 0.15 * e})` };
  }
}

/** The outgoing shot while the next one arrives (t: 0 → 1). */
function exitStyle(type: Clip["transition"], t: number): React.CSSProperties {
  const e = ease(t);
  switch (type) {
    case "morph":
      return { transform: `scale(${1 + 0.07 * e})`, filter: `blur(${e * 14}px)` };
    case "zoom_through":
      return { opacity: 1 - Math.max(0, (t - 0.35) / 0.65), transform: `scale(${1 + 2.2 * e})`, filter: `blur(${e * 8}px)` };
    case "whip":
      return { transform: `translateX(${-e * 100}%)`, filter: `blur(${bump(t) * 12}px)` };
    case "slide_left":
      return { transform: `translateX(${-e * 30}%)` };
    case "slide_up":
      return { transform: `translateY(${-e * 30}%)` };
    case "zoom":
      return { transform: `scale(${1 + 0.1 * e})` };
    default:
      return {};
  }
}

/** The next clip's transition, when it starts right where this one ends (on the same track). */
export interface ClipExit {
  type: Clip["transition"];
  frames: number;
}

function transitionStyle(clip: Clip, frame: number, fps: number, durationFrames: number, exit: ClipExit | null): React.CSSProperties {
  if (exit && frame >= durationFrames) return exitStyle(exit.type, Math.min(1, (frame - durationFrames) / exit.frames));
  if (clip.transition === "none") return {};
  const frames = Math.max(1, toFrames(clip.transitionDuration, fps));
  if (frame >= frames) return {};
  return enterStyle(clip.transition, Math.max(0, frame / frames));
}

/** Fade an outgoing clip's sound out while the next clip arrives. */
function exitGain(frame: number, durationFrames: number, exit: ClipExit | null): number {
  if (!exit || frame < durationFrames) return 1;
  return Math.max(0, 1 - (frame - durationFrames) / exit.frames);
}

/** Full frame, or the clip's box for this aspect ratio. */
const Frame: React.FC<{ box: Box | null; style?: React.CSSProperties; children: React.ReactNode }> = ({ box, style, children }) => {
  const { width, height } = useVideoConfig();
  if (!box) return <AbsoluteFill style={{ overflow: "hidden", ...style }}>{children}</AbsoluteFill>;
  const w = box.w * width;
  const h = box.h * height;
  return (
    <div
      style={{
        position: "absolute",
        left: box.x * width,
        top: box.y * height,
        width: w,
        height: h,
        overflow: "hidden",
        borderRadius: box.radius * Math.min(w, h),
        boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Merge a transition's style with the clip's own opacity (opacities multiply). */
function frameStyle(opacity: number, transition: React.CSSProperties): React.CSSProperties {
  return { ...transition, opacity: opacity * (typeof transition.opacity === "number" ? transition.opacity : 1) };
}

const VisualClip: React.FC<{ clip: Clip; url: string; box: Box | null; gain: number; muted: boolean; exit: ClipExit | null }> = ({ clip, url, box, gain, muted, exit }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationFrames = Math.max(1, toFrames(clip.duration, fps));
  const progress = Math.min(1, frame / durationFrames);
  const fadeIn = toFrames(clip.fadeIn, fps);
  const fadeOut = toFrames(clip.fadeOut, fps);
  const opacity = fadeEnvelope(Math.min(frame, durationFrames), durationFrames, fadeIn, fadeOut);
  const mediaStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: clip.fit,
    transform: motionTransform(clip, progress),
  };
  return (
    <Frame box={box} style={frameStyle(opacity, transitionStyle(clip, frame, fps, durationFrames, exit))}>
      {clip.kind === "image" ? (
        <Img src={url} style={mediaStyle} />
      ) : (
        <OffthreadVideo
          src={url}
          style={mediaStyle}
          trimBefore={toFrames(clip.sourceStart, fps)}
          muted={muted || clip.volume === 0 || gain === 0}
          volume={(f) => clip.volume * gain * fadeEnvelope(Math.min(f, durationFrames), durationFrames, fadeIn, fadeOut) * exitGain(f, durationFrames, exit)}
        />
      )}
    </Frame>
  );
};

const SceneClip: React.FC<{ clip: Clip; url: string; box: Box | null; ratio: AspectRatio; exit: ClipExit | null }> = ({ clip, url, box, ratio, exit }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { component: Scene, error } = useScene(url);
  const durationFrames = Math.max(1, toFrames(clip.duration, fps));
  const opacity = fadeEnvelope(Math.min(frame, durationFrames), durationFrames, toFrames(clip.fadeIn, fps), toFrames(clip.fadeOut, fps));
  const name = clip.label || clip.component || "scene";
  return (
    <Frame box={box} style={frameStyle(opacity, transitionStyle(clip, frame, fps, durationFrames, exit))}>
      {error ? (
        <SceneProblem name={name} message={error.message} />
      ) : Scene ? (
        <SceneErrorBoundary name={name}>
          <Scene {...clip.props} ratio={ratio} durationInFrames={durationFrames} />
        </SceneErrorBoundary>
      ) : null}
    </Frame>
  );
};

const AudioClip: React.FC<{ clip: Clip; url: string; gain: number }> = ({ clip, url, gain }) => {
  const { fps } = useVideoConfig();
  const durationFrames = Math.max(1, toFrames(clip.duration, fps));
  const fadeIn = toFrames(clip.fadeIn, fps);
  const fadeOut = toFrames(clip.fadeOut, fps);
  return <Audio src={url} trimBefore={toFrames(clip.sourceStart, fps)} volume={(f) => clip.volume * gain * fadeEnvelope(f, durationFrames, fadeIn, fadeOut)} />;
};

const TextClip: React.FC<{ clip: Clip; style: CaptionStyle }> = ({ clip, style }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const durationFrames = Math.max(1, toFrames(clip.duration, fps));
  const edge = Math.min(4, durationFrames / 4);
  const opacity = fadeEnvelope(frame, durationFrames, edge, edge);
  const base = Math.min(width, height);
  if (clip.kind === "title") {
    return (
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity, padding: base * 0.08 }}>
        <div style={{ fontFamily: bengaliFont, fontWeight: 700, fontSize: base * 0.075, lineHeight: 1.35, color: "white", textAlign: "center", textShadow: "0 2px 18px rgba(0,0,0,0.6)" }}>
          {clip.text}
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: height * style.bottom, paddingInline: width * 0.08, opacity }}>
      <div
        style={{
          fontFamily: bengaliFont,
          fontWeight: 600,
          fontSize: base * style.size,
          lineHeight: 1.5,
          color: style.color,
          textAlign: "center",
          background: style.background,
          borderRadius: base * 0.012,
          padding: `${base * 0.008}px ${base * 0.022}px`,
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

export const Video: React.FC<VideoProps> = ({ timeline, ratio, fileBase, sceneBase, versions }) => {
  const { fps } = useVideoConfig();
  const heard = audibleTracks(timeline);
  const sequence = (clip: Clip, child: React.ReactNode, tailFrames = 0) => (
    <Sequence
      key={clip.id}
      from={toFrames(clip.start, fps)}
      durationInFrames={Math.max(1, toFrames(clip.duration, fps)) + tailFrames}
      premountFor={Math.round(fps * 1.5)}
      name={clip.label || clip.kind}
    >
      {child}
    </Sequence>
  );
  /** If the next clip on the track starts where this ends with a transition, keep this one playing under it. */
  const exitFor = (clip: Clip, trackClips: Clip[]): ClipExit | null => {
    const end = clip.start + clip.duration;
    const next = trackClips.find((c) => c.id !== clip.id && Math.abs(c.start - end) < 0.05);
    if (!next || next.transition === "none" || next.transitionDuration <= 0) return null;
    return { type: next.transition, frames: Math.max(1, toFrames(Math.min(next.transitionDuration, next.duration), fps)) };
  };

  // Higher tracks in the editor are drawn in front, so render bottom-up.
  const visualTracks = timeline.tracks.filter((t) => t.kind === "video" && !t.hidden).reverse();
  const audioTracks = timeline.tracks.filter((t) => t.kind === "audio" && heard.has(t.id));
  const textTracks = timeline.tracks.filter((t) => t.kind === "text" && !t.hidden).reverse();

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {visualTracks.map((track) => {
        // Sorted by start so an incoming clip is drawn above the outgoing one.
        const trackClips = timeline.clips.filter((c) => c.trackId === track.id).sort((a, b) => a.start - b.start);
        return (
          <AbsoluteFill key={track.id}>
            {trackClips.map((clip) => {
              const box = boxFor(clip, ratio);
              const exit = exitFor(clip, trackClips);
              const tail = exit?.frames ?? 0;
              if (clip.kind === "scene" && clip.component) {
                return sequence(clip, <SceneClip clip={clip} url={urlFor(sceneBase, clip.component, versions)} box={box} ratio={ratio} exit={exit} />, tail);
              }
              if ((clip.kind === "video" || clip.kind === "image") && clip.src) {
                const gain = heard.has(track.id) ? track.volume : 0;
                return sequence(
                  clip,
                  <VisualClip clip={clip} url={urlFor(fileBase, clip.src, versions)} box={box} gain={gain} muted={!heard.has(track.id)} exit={exit} />,
                  tail,
                );
              }
              return null;
            })}
          </AbsoluteFill>
        );
      })}
      {audioTracks.map((track) =>
        timeline.clips
          .filter((c) => c.trackId === track.id && c.src && track.volume > 0)
          .map((clip) => sequence(clip, <AudioClip clip={clip} url={urlFor(fileBase, clip.src!, versions)} gain={track.volume} />)),
      )}
      {textTracks.map((track) => (
        <AbsoluteFill key={track.id}>
          {timeline.clips
            .filter((c) => c.trackId === track.id && c.text.trim())
            .map((clip) => sequence(clip, <TextClip clip={clip} style={timeline.captionStyle} />))}
        </AbsoluteFill>
      ))}
    </AbsoluteFill>
  );
};

/** Composition size, frame rate and length for a project in one shape. */
export function compositionMetadata(props: Pick<VideoProps, "timeline" | "fps" | "ratio">) {
  const end = props.timeline.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  const { width, height } = dimensionsFor(props.ratio, BASE_RESOLUTION);
  return {
    durationInFrames: Math.max(1, Math.ceil(Math.max(1, end) * props.fps)),
    fps: props.fps,
    width,
    height,
  };
}
