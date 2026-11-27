import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

let cachedRoot: string | null = null;

/**
 * The repository root (the folder whose package.json declares workspaces).
 * The web app and worker run from different folders; both resolve data
 * paths from here so they always agree.
 */
export function repoRoot(): string {
  if (cachedRoot) return cachedRoot;
  let dir = process.cwd();
  for (;;) {
    const pkg = path.join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        if (JSON.parse(readFileSync(pkg, "utf8")).workspaces) return (cachedRoot = dir);
      } catch {
        // keep walking up
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return (cachedRoot = process.cwd());
    dir = parent;
  }
}

const binaryCache = new Map<string, string>();

/**
 * Path of `ffmpeg` / `ffprobe`. Uses FFMPEG_PATH / FFPROBE_PATH when set,
 * then a system install on the PATH, and finally the copy Remotion ships
 * for this platform (so the app works without installing FFmpeg).
 */
export function ffmpegBinary(name: "ffmpeg" | "ffprobe"): string {
  const env = name === "ffmpeg" ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH;
  if (env) return env;
  const cached = binaryCache.get(name);
  if (cached) return cached;
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const pathDirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  let found = pathDirs.map((d) => path.join(d, exe)).find((p) => existsSync(p));
  if (!found) {
    const suffixes = process.platform === "win32" ? ["-msvc"] : process.platform === "linux" ? ["-gnu", "-musl"] : [""];
    for (const suffix of suffixes) {
      const candidate = path.join(
        /*turbopackIgnore: true*/ repoRoot(),
        "node_modules",
        "@remotion",
        `compositor-${process.platform}-${process.arch}${suffix}`,
        exe,
      );
      if (existsSync(candidate)) {
        found = candidate;
        break;
      }
    }
  }
  const result = found ?? name;
  binaryCache.set(name, result);
  return result;
}

/** Where media files live (MEDIA_ROOT, default <repo>/storage). */
export function mediaRoot(): string {
  const configured = process.env.MEDIA_ROOT ?? "storage";
  // Media lives outside the app bundle; don't let the bundler trace it.
  return path.isAbsolute(configured) ? configured : path.join(/*turbopackIgnore: true*/ repoRoot(), configured);
}
