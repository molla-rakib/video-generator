import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { CameraMove, FocusPoint, MediaItem, SubjectBox } from "../../lib/spec/schema";
import { resolveSrc } from "../media";

type Props = {
  media: MediaItem;
  motion: CameraMove;
  focus?: FocusPoint;
  subject?: SubjectBox;
  fit: "auto" | "cover" | "contain";
  /** Length of the move in frames (usually the whole segment). */
  durationInFrames: number;
  /** Optional extra CSS filter (e.g. color grade). */
  filter?: string;
};

/** Without a subject box, "auto" switches to "contain" if cover would show less than this share of the image. */
const MIN_VISIBLE_FOR_COVER = 0.5;

type Move = { z0: number; z1: number; dx0: number; dx1: number; dy0: number; dy1: number };

const MOVES: Record<CameraMove, Move> = {
  "push-in": { z0: 1.0, z1: 1.16, dx0: 0, dx1: 0, dy0: 0, dy1: 0 },
  "pull-out": { z0: 1.16, z1: 1.0, dx0: 0, dx1: 0, dy0: 0, dy1: 0 },
  "pan-left": { z0: 1.12, z1: 1.12, dx0: 0.06, dx1: -0.06, dy0: 0, dy1: 0 },
  "pan-right": { z0: 1.12, z1: 1.12, dx0: -0.06, dx1: 0.06, dy0: 0, dy1: 0 },
  "pan-up": { z0: 1.12, z1: 1.12, dx0: 0, dx1: 0, dy0: 0.06, dy1: -0.06 },
  "pan-down": { z0: 1.12, z1: 1.12, dx0: 0, dx1: 0, dy0: -0.06, dy1: 0.06 },
  still: { z0: 1.02, z1: 1.06, dx0: 0, dx1: 0, dy0: 0, dy1: 0 },
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Keeps the view center so that [lo, lo+len] stays inside a window of size `view` (all normalized). */
function keepInView(center: number, view: number, lo: number, len: number) {
  if (len >= view) return lo + len / 2; // can't fit fully: center on the subject
  return clamp(center, lo + len - view / 2, lo + view / 2);
}

/**
 * Places an image (iw × ih) in a (W × H) frame, zoomed by `zoom`, with image
 * point (cx, cy) as close to the frame center as possible without revealing an edge.
 */
function coverRect(W: number, H: number, iw: number, ih: number, cx: number, cy: number, zoom: number) {
  const scale = Math.max(W / iw, H / ih) * zoom;
  const w = iw * scale;
  const h = ih * scale;
  return {
    left: clamp(W / 2 - cx * w, W - w, 0),
    top: clamp(H / 2 - cy * h, H - h, 0),
    width: w,
    height: h,
  };
}

/** Which fit to use for this image in this frame. */
export function resolveFit(
  W: number,
  H: number,
  media: MediaItem,
  fit: Props["fit"],
  subject: SubjectBox | undefined,
  maxZoom: number,
): "cover" | "contain" {
  if (fit !== "auto") return fit;
  const coverScale = Math.max(W / media.width, H / media.height);
  const viewW = W / (media.width * coverScale);
  const viewH = H / (media.height * coverScale);
  if (subject) {
    // Subject must fit inside the crop even at the tightest zoom of the move.
    return subject.w <= viewW / maxZoom + 1e-6 && subject.h <= viewH / maxZoom + 1e-6 ? "cover" : "contain";
  }
  return Math.min(viewW, viewH) < MIN_VISIBLE_FOR_COVER ? "contain" : "cover";
}

export const KenBurnsPhoto: React.FC<Props> = ({ media, motion, focus, subject, fit, durationInFrames, filter }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const f = focus ?? media.focus;
  const box = subject ?? media.subject;
  const m = MOVES[motion];

  const p = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.33, 0, 0.67, 1),
  });
  const zoom = m.z0 + (m.z1 - m.z0) * p;
  let cx = clamp(f.x + m.dx0 + (m.dx1 - m.dx0) * p, 0, 1);
  let cy = clamp(f.y + m.dy0 + (m.dy1 - m.dy0) * p, 0, 1);

  const mode = resolveFit(W, H, media, fit, box, Math.max(m.z0, m.z1));
  const src = resolveSrc(media.src);

  if (mode === "cover") {
    if (box) {
      const scale = Math.max(W / media.width, H / media.height) * zoom;
      cx = keepInView(cx, W / (media.width * scale), box.x, box.w);
      cy = keepInView(cy, H / (media.height * scale), box.y, box.h);
    }
    const r = coverRect(W, H, media.width, media.height, cx, cy, zoom);
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <Img src={src} style={{ position: "absolute", ...r, filter, maxWidth: "none" }} />
      </AbsoluteFill>
    );
  }

  // contain: whole image visible, over a blurred, darkened copy filling the frame.
  const bg = coverRect(W, H, media.width, media.height, f.x, f.y, 1.15);
  const fgScale = Math.min(W / media.width, H / media.height) * (0.96 + (zoom - 1) * 0.5);
  const fw = media.width * fgScale;
  const fh = media.height * fgScale;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={src}
        style={{
          position: "absolute",
          ...bg,
          maxWidth: "none",
          filter: `blur(40px) brightness(0.45) saturate(0.8) ${filter ?? ""}`,
        }}
      />
      <Img
        src={src}
        style={{
          position: "absolute",
          left: (W - fw) / 2,
          top: (H - fh) / 2,
          width: fw,
          height: fh,
          maxWidth: "none",
          boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
          filter,
        }}
      />
    </AbsoluteFill>
  );
};
