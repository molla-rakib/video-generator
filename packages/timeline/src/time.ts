/**
 * Time conversion helpers.
 *
 * Rule: the timeline stores every time in SECONDS (floating point, rounded to
 * millisecond precision). Frames exist only at the rendering boundary and are
 * always derived with `secondsToFrames` so every part of the system agrees on
 * the same rounding.
 */

/** Two times closer than this are considered equal (1 ms). */
export const TIME_EPSILON = 0.001;

function assertFps(fps: number): void {
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new RangeError(`FPS must be a positive number, received ${fps}`);
  }
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number, received ${value}`);
  }
}

/** frame = Math.round(seconds * fps) — the single source of frame rounding. */
export function secondsToFrames(seconds: number, fps: number): number {
  assertFps(fps);
  assertFinite(seconds, "seconds");
  return Math.round(seconds * fps);
}

export function framesToSeconds(frames: number, fps: number): number {
  assertFps(fps);
  assertFinite(frames, "frames");
  return roundTime(frames / fps);
}

/**
 * Number of frames needed to cover a duration. Never less than 1, because
 * Remotion compositions and sequences must have a positive duration.
 */
export function durationInFrames(durationSeconds: number, fps: number): number {
  return Math.max(1, secondsToFrames(durationSeconds, fps));
}

export function msToSeconds(ms: number): number {
  assertFinite(ms, "milliseconds");
  return roundTime(ms / 1000);
}

export function secondsToMs(seconds: number): number {
  assertFinite(seconds, "seconds");
  return Math.round(seconds * 1000);
}

/** Round to millisecond precision to keep stored values free of float noise. */
export function roundTime(seconds: number): number {
  assertFinite(seconds, "seconds");
  const rounded = Math.round(seconds * 1000) / 1000;
  // Normalise -0 to 0 so equality checks and JSON stay clean.
  return rounded === 0 ? 0 : rounded;
}

export function timesEqual(a: number, b: number, epsilon = TIME_EPSILON): boolean {
  return Math.abs(a - b) < epsilon;
}

/**
 * Snap a time in seconds to the nearest frame boundary. Useful before saving
 * user edits so that what they see in the editor is exactly what renders.
 */
export function snapToFrame(seconds: number, fps: number): number {
  return framesToSeconds(secondsToFrames(seconds, fps), fps);
}

/** "1:05", "12:00", "1:02:03" — a compact clock for timelines and lists. */
export function formatClock(seconds: number): string {
  assertFinite(seconds, "seconds");
  const negative = seconds < 0;
  const total = Math.floor(Math.abs(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  const body = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  return negative ? `-${body}` : body;
}

/** "45 sec", "3 min", "3 min 20 sec", "1 hr 2 min" — for people, not machines. */
export function formatDurationHuman(seconds: number): string {
  assertFinite(seconds, "seconds");
  const total = Math.round(Math.abs(seconds));
  if (total < 60) return `${total} sec`;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
  return s > 0 ? `${m} min ${s} sec` : `${m} min`;
}
