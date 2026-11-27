import { stat } from "node:fs/promises";
import path from "node:path";
import { build, type Message, type Plugin } from "esbuild";

/**
 * SCENE COMPILER (server side)
 *
 * Scenes are React/Remotion components written by the AI agent as plain
 * `.tsx` files in the project folder. This turns one scene (plus any files
 * it imports from the project folder) into a single script the preview and
 * the renderer can evaluate. React and Remotion are NOT bundled: the script
 * uses the app's own copies (see `SHARED_MODULES` in scene-loader.tsx), so
 * hooks like useCurrentFrame() work inside the player.
 */

/** Modules a scene may import; everything else must be a file in the project. */
export const SHARED_MODULE_IDS = ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "remotion"] as const;

/** The global the compiled script assigns its exports to. */
export const SCENE_GLOBAL = "__studioScene";

export class SceneCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SceneCompileError";
  }
}

interface CacheEntry {
  code: string;
  inputs: Array<{ file: string; mtimeMs: number }>;
}
const cache = new Map<string, CacheEntry>();

async function stillFresh(entry: CacheEntry): Promise<boolean> {
  for (const input of entry.inputs) {
    const info = await stat(input.file).catch(() => null);
    if (!info || info.mtimeMs !== input.mtimeMs) return false;
  }
  return true;
}

function formatMessages(messages: Message[], root: string): string {
  return messages
    .slice(0, 5)
    .map((m) => {
      const where = m.location ? `${path.relative(root, m.location.file).replace(/\\/g, "/")}:${m.location.line}:${m.location.column + 1} ` : "";
      return `${where}${m.text}`;
    })
    .join("\n");
}

function sandboxPlugin(root: string): Plugin {
  const inside = (file: string) => {
    const rel = path.relative(root, file);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  };
  return {
    name: "studio-scene-sandbox",
    setup(b) {
      b.onResolve({ filter: /.*/ }, (args) => {
        if ((SHARED_MODULE_IDS as readonly string[]).includes(args.path)) return { path: args.path, namespace: "studio-shared" };
        if (args.kind === "entry-point") return undefined;
        if (args.path.startsWith(".") || path.isAbsolute(args.path)) return undefined; // resolved by esbuild, checked in onLoad
        return {
          errors: [{ text: `"${args.path}" can't be imported by a scene. Scenes may import react, remotion and files inside the project folder.` }],
        };
      });
      b.onLoad({ filter: /.*/, namespace: "studio-shared" }, (args) => ({
        contents: `module.exports = globalThis.__studioModules[${JSON.stringify(args.path)}];`,
        loader: "js",
      }));
      b.onLoad({ filter: /.*/, namespace: "file" }, (args) => {
        if (!inside(args.path)) return { errors: [{ text: "Scenes can only use files inside the project folder." }] };
        return undefined;
      });
    },
  };
}

/**
 * Compile `relativePath` (e.g. "scenes/Shot01.tsx") inside `projectRoot`.
 * Results are cached until any input file changes.
 */
export async function compileScene(projectRoot: string, relativePath: string): Promise<string> {
  const root = path.resolve(projectRoot);
  const entry = path.resolve(root, ...relativePath.split("/"));
  if (!entry.startsWith(root + path.sep)) throw new SceneCompileError("The scene must be inside the project folder.");
  if (!/\.(tsx|jsx|ts|js)$/.test(entry)) throw new SceneCompileError("A scene must be a .tsx, .jsx, .ts or .js file.");
  if (!(await stat(entry).catch(() => null))) throw new SceneCompileError(`The scene file ${relativePath} doesn't exist.`);

  const cached = cache.get(entry);
  if (cached && (await stillFresh(cached))) return cached.code;

  let result;
  try {
    result = await build({
      entryPoints: [entry],
      absWorkingDir: root,
      bundle: true,
      write: false,
      metafile: true,
      format: "iife",
      globalName: SCENE_GLOBAL,
      platform: "browser",
      target: "es2022",
      jsx: "automatic",
      jsxImportSource: "react",
      loader: { ".png": "dataurl", ".jpg": "dataurl", ".jpeg": "dataurl", ".webp": "dataurl", ".svg": "dataurl", ".json": "json" },
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "silent",
      plugins: [sandboxPlugin(root)],
    });
  } catch (error) {
    const messages = (error as { errors?: Message[] }).errors;
    throw new SceneCompileError(messages?.length ? formatMessages(messages, root) : error instanceof Error ? error.message : String(error));
  }
  const code = result.outputFiles[0]?.text ?? "";
  const inputs = await Promise.all(
    Object.keys(result.metafile.inputs)
      .filter((p) => !p.startsWith("studio-shared:"))
      .map(async (p) => {
        const file = path.resolve(root, p);
        return { file, mtimeMs: (await stat(file)).mtimeMs };
      }),
  );
  cache.set(entry, { code, inputs });
  return code;
}
