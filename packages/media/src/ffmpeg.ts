import { spawn } from "node:child_process";

/**
 * FFmpeg helpers used by the worker. Every function works on local file
 * paths and throws an Error with a readable message on failure.
 */

const FFMPEG = () => process.env.FFMPEG_PATH ?? "ffmpeg";

export class FfmpegUnavailableError extends Error {
  constructor() {
    super("FFmpeg is not installed or not on the PATH. Install FFmpeg to process media.");
    this.name = "FfmpegUnavailableError";
  }
}

/** Run ffmpeg; resolves with stdout as a Buffer. */
export function runFfmpeg(args: string[], options: { timeoutMs?: number } = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(/*turbopackIgnore: true*/ FFMPEG(), ["-hide_banner", "-v", "error", ...args], { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 10 * 60_000);
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => {
      if (err.length < 4000) err += d.toString();
    });
    child.on("error", (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(e.code === "ENOENT" ? new FfmpegUnavailableError() : e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`FFmpeg failed (${code}): ${err.trim().split("\n").slice(-3).join(" ")}`));
    });
  });
}

export interface Waveform {
  peaksPerSecond: number;
  /** Peak amplitude per bucket, 0–1. */
  peaks: number[];
}

/** Compute a waveform (peak per 20 ms) from any audio/video file. */
export async function extractWaveform(filePath: string, peaksPerSecond = 50): Promise<Waveform> {
  const sampleRate = 8000;
  const pcm = await runFfmpeg(["-i", filePath, "-vn", "-ac", "1", "-ar", String(sampleRate), "-f", "s16le", "pipe:1"]);
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  const bucket = Math.max(1, Math.floor(sampleRate / peaksPerSecond));
  const peaks: number[] = [];
  let max = 0;
  for (let i = 0; i < samples.length; i += bucket) {
    let peak = 0;
    const end = Math.min(samples.length, i + bucket);
    for (let j = i; j < end; j++) {
      const v = Math.abs(samples[j]!);
      if (v > peak) peak = v;
    }
    peaks.push(peak);
    if (peak > max) max = peak;
  }
  // Normalise so quiet recordings are still visible.
  const scale = max > 0 ? 1 / max : 0;
  return { peaksPerSecond: sampleRate / bucket, peaks: peaks.map((p) => Math.round(p * scale * 1000) / 1000) };
}

/** A JPEG preview: the image itself, or a frame from a video. */
export async function extractThumbnail(input: string, output: string, options: { atSeconds?: number; width?: number } = {}): Promise<void> {
  const seek = options.atSeconds !== undefined ? ["-ss", String(options.atSeconds)] : [];
  await runFfmpeg([
    "-y",
    ...seek,
    "-i",
    input,
    "-frames:v",
    "1",
    "-vf",
    `scale=${options.width ?? 480}:-2`,
    "-q:v",
    "4",
    output,
  ]);
}

/** Tile size used for filmstrips (the UI relies on this aspect). */
export const FILMSTRIP_TILE = { width: 160, height: 90 } as const;

/**
 * A horizontal strip of evenly spaced video frames for timeline thumbnails.
 * Returns the number of frames in the strip.
 */
export async function extractFilmstrip(input: string, output: string, durationSeconds: number): Promise<number> {
  const frames = Math.min(40, Math.max(1, Math.ceil(durationSeconds / 2)));
  const fps = frames / Math.max(durationSeconds, 0.1);
  const { width, height } = FILMSTRIP_TILE;
  await runFfmpeg([
    "-y",
    "-i",
    input,
    "-vf",
    `fps=${fps.toFixed(5)},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,tile=${frames}x1`,
    "-frames:v",
    "1",
    "-q:v",
    "5",
    output,
  ]);
  return frames;
}

/** 16 kHz mono WAV — the format speech recognisers prefer. */
export async function convertToSpeechWav(input: string, output: string): Promise<void> {
  await runFfmpeg(["-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", output]);
}

/** Re-encode any audio to a browser- and Remotion-friendly format. */
export async function convertToMp3(input: string, output: string): Promise<void> {
  await runFfmpeg(["-y", "-i", input, "-vn", "-c:a", "libmp3lame", "-q:a", "2", output]);
}

/** Join several audio files end to end into one MP3. */
export async function concatAudio(inputs: string[], output: string): Promise<void> {
  if (inputs.length === 0) throw new Error("Nothing to join");
  const args: string[] = ["-y"];
  for (const input of inputs) args.push("-i", input);
  const streams = inputs.map((_, i) => `[${i}:a]`).join("");
  args.push("-filter_complex", `${streams}concat=n=${inputs.length}:v=0:a=1[out]`, "-map", "[out]", "-c:a", "libmp3lame", "-q:a", "2", output);
  await runFfmpeg(args);
}
