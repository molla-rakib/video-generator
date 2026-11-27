import { spawn } from "node:child_process";
import { ffmpegBinary } from "./paths";

/**
 * FFmpeg helpers used by the worker. Every function works on local file
 * paths and throws an Error with a readable message on failure.
 */

const FFMPEG = () => ffmpegBinary("ffmpeg");

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

/** The sample bytes of a WAV file (everything after the "data" chunk header), 2-byte aligned. */
function wavData(wav: Buffer): Buffer {
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === "data") {
      // Piped WAVs may carry a placeholder size; take everything to the end.
      const data = wav.subarray(offset + 8);
      return data.subarray(0, data.length - (data.length % 2));
    }
    offset += 8 + size + (size % 2);
  }
  return Buffer.alloc(0);
}

/** Compute a waveform (peak per 20 ms) from any audio/video file. */
export async function extractWaveform(filePath: string, peaksPerSecond = 50): Promise<Waveform> {
  const sampleRate = 8000;
  // WAV (not raw s16le) so it also works with minimal FFmpeg builds such as Remotion's.
  const wav = await runFfmpeg(["-i", filePath, "-vn", "-ac", "1", "-ar", String(sampleRate), "-c:a", "pcm_s16le", "-f", "wav", "pipe:1"]);
  const pcm = wavData(wav);
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

interface LoudnormMeasure {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

/** Run ffmpeg at info level and return stderr (where loudnorm prints its report). */
function ffmpegStderr(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(/*turbopackIgnore: true*/ FFMPEG(), ["-hide_banner", "-nostats", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString();
      if (err.length > 200_000) err = err.slice(-100_000);
    });
    child.on("error", (e: NodeJS.ErrnoException) => reject(e.code === "ENOENT" ? new FfmpegUnavailableError() : e));
    child.on("close", (code) => (code === 0 ? resolve(err) : reject(new Error(`FFmpeg failed (${code}): ${err.trim().split("\n").slice(-3).join(" ")}`))));
  });
}

/**
 * Normalise a finished video's loudness for social media (EBU R128 two-pass
 * loudnorm, default −14 LUFS integrated, −1 dBTP peak). The picture is
 * copied untouched. Returns the measured input loudness, or null when the
 * file has no sound (it is then copied as is).
 */
export async function normalizeLoudness(
  input: string,
  output: string,
  options: { targetLufs?: number; truePeak?: number; audioCodec?: "aac" | "libopus" } = {},
): Promise<{ inputLufs: number } | null> {
  const I = options.targetLufs ?? -14;
  const TP = options.truePeak ?? -1;
  const LRA = 11;
  const report = await ffmpegStderr(["-i", input, "-vn", "-af", `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:print_format=json`, "-f", "null", "-"]);
  const json = /\{[^{}]*"input_i"[^{}]*\}/.exec(report)?.[0];
  if (!json) {
    await runFfmpeg(["-y", "-i", input, "-c", "copy", output]);
    return null;
  }
  const m = JSON.parse(json) as LoudnormMeasure;
  if (!Number.isFinite(Number(m.input_i))) {
    // Silent audio: nothing to normalise.
    await runFfmpeg(["-y", "-i", input, "-c", "copy", output]);
    return null;
  }
  const filter =
    `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}` +
    `:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  const codec = options.audioCodec ?? "aac";
  const encode = (af: string) =>
    runFfmpeg([
      "-y", "-i", input, "-map", "0:v?", "-map", "0:a", "-c:v", "copy", "-af", af, "-ar", "48000",
      "-c:a", codec, "-b:a", codec === "aac" ? "192k" : "160k", "-movflags", "+faststart", output,
    ]);
  await encode(filter);
  // Resampling and lossy encoding can push peaks back over the ceiling.
  // Without a limiter filter available everywhere, check the finished file
  // and trim the gain by exactly the overshoot (plus a little headroom).
  const peak = await measureTruePeak(output);
  if (peak !== null && peak > TP) await encode(`${filter},volume=${(TP - peak - 0.3).toFixed(2)}dB`);
  return { inputLufs: Number(m.input_i) };
}

/** True peak (dBTP) of a file's audio, or null when it can't be measured. */
export async function measureTruePeak(file: string): Promise<number | null> {
  const report = await ffmpegStderr(["-i", file, "-vn", "-af", "loudnorm=print_format=json", "-f", "null", "-"]);
  const json = /\{[^{}]*"input_tp"[^{}]*\}/.exec(report)?.[0];
  const tp = json ? Number((JSON.parse(json) as LoudnormMeasure).input_tp) : NaN;
  return Number.isFinite(tp) ? tp : null;
}
