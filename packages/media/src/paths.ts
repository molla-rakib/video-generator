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

/** Where media files live (MEDIA_ROOT, default <repo>/storage). */
export function mediaRoot(): string {
  const configured = process.env.MEDIA_ROOT ?? "storage";
  // Media lives outside the app bundle; don't let the bundler trace it.
  return path.isAbsolute(configured) ? configured : path.join(/*turbopackIgnore: true*/ repoRoot(), configured);
}
