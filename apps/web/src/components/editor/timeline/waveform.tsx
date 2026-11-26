"use client";

import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "../context";

interface WaveformData {
  peaksPerSecond: number;
  peaks: number[];
}

const cache = new Map<string, Promise<WaveformData | null>>();

function loadWaveform(assetId: string): Promise<WaveformData | null> {
  let p = cache.get(assetId);
  if (!p) {
    p = fetch(mediaUrl(assetId, "waveform"))
      .then((r) => (r.ok ? (r.json() as Promise<WaveformData>) : null))
      .catch(() => null);
    cache.set(assetId, p);
  }
  return p;
}

/** Draws the real waveform (from FFmpeg peaks) for the visible part of a clip. */
export function Waveform({
  assetId,
  sourceStart,
  duration,
  width,
  height,
  color,
}: {
  assetId: string;
  sourceStart: number;
  duration: number;
  width: number;
  height: number;
  color: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<WaveformData | null>(null);

  useEffect(() => {
    let alive = true;
    void loadWaveform(assetId).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [assetId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.min(4000, Math.max(1, Math.round(width)));
    canvas.width = w * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, height);
    ctx.fillStyle = color;
    const first = sourceStart * data.peaksPerSecond;
    const span = duration * data.peaksPerSecond;
    const mid = height / 2;
    for (let x = 0; x < w; x++) {
      const a = Math.floor(first + (x / w) * span);
      const b = Math.max(a + 1, Math.floor(first + ((x + 1) / w) * span));
      let peak = 0;
      for (let i = a; i < b && i < data.peaks.length; i++) peak = Math.max(peak, data.peaks[i] ?? 0);
      const h = Math.max(1, peak * (height - 4));
      ctx.fillRect(x, mid - h / 2, 1, h);
    }
  }, [data, sourceStart, duration, width, height, color]);

  return <canvas ref={canvasRef} style={{ width: "100%", height }} className="pointer-events-none block" aria-hidden />;
}

/** Video thumbnails along a clip, taken from the asset's filmstrip. */
export function Filmstrip({
  assetId,
  frames,
  sourceDuration,
  sourceStart,
  zoom,
  width,
  height,
}: {
  assetId: string;
  frames: number;
  sourceDuration: number;
  sourceStart: number;
  zoom: number;
  width: number;
  height: number;
}) {
  const tileW = (height * 16) / 9;
  const count = Math.min(120, Math.max(1, Math.ceil(width / tileW)));
  const url = mediaUrl(assetId, "strip");
  return (
    <div className="pointer-events-none absolute inset-0 flex overflow-hidden" aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const t = sourceStart + ((i + 0.5) * tileW) / zoom;
        const index = Math.min(frames - 1, Math.max(0, Math.floor((t / sourceDuration) * frames)));
        return (
          <div
            key={i}
            className="h-full shrink-0"
            style={{
              width: tileW,
              backgroundImage: `url(${url})`,
              backgroundSize: `${frames * tileW}px ${height}px`,
              backgroundPosition: `${-index * tileW}px 0`,
            }}
          />
        );
      })}
    </div>
  );
}
