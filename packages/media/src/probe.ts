import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ffmpegBinary } from "./paths";

const execFileAsync = promisify(execFile);

export interface MediaInfo {
  /** Seconds, or null for still images. */
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
  hasVideo: boolean;
  formatName: string;
}

export class FfprobeUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("FFmpeg (ffprobe) is not installed or not on the PATH. Install FFmpeg to inspect media files.");
    this.name = "FfprobeUnavailableError";
    this.cause = cause;
  }
}

interface FfprobeOutput {
  format?: { duration?: string; format_name?: string };
  streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string }>;
}

/** Parse ffprobe JSON. Exported for tests. */
export function parseFfprobe(output: FfprobeOutput): MediaInfo {
  const streams = output.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  const raw = output.format?.duration ?? audio?.duration ?? video?.duration;
  const duration = raw !== undefined ? Number.parseFloat(raw) : Number.NaN;
  return {
    durationSeconds: Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) / 1000 : null,
    width: video?.width ?? null,
    height: video?.height ?? null,
    hasAudio: Boolean(audio),
    hasVideo: Boolean(video),
    formatName: output.format?.format_name ?? "unknown",
  };
}

/** Inspect a local media file with ffprobe. */
export async function probeMedia(filePath: string, ffprobePath = ffmpegBinary("ffprobe")): Promise<MediaInfo> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      ffprobePath,
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath],
      { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 },
    ));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new FfprobeUnavailableError(error);
    throw new Error(`This file could not be read as audio or video.`, { cause: error });
  }
  return parseFfprobe(JSON.parse(stdout) as FfprobeOutput);
}
