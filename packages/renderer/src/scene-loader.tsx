import React, { useEffect, useState } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as Remotion from "remotion";
import { cancelRender, continueRender, delayRender, getRemotionEnvironment } from "remotion";

/**
 * SCENE LOADER (browser side — preview player and headless renderer)
 *
 * Fetches a compiled scene script (see scene-compiler.ts), evaluates it with
 * the app's own React and Remotion, and returns its component. Each URL is
 * loaded once; change the URL (we add the file's version) to reload it.
 */

const SHARED_MODULES: Record<string, unknown> = {
  react: React,
  "react/jsx-runtime": jsxRuntime,
  "react/jsx-dev-runtime": jsxRuntime,
  remotion: Remotion,
};
(globalThis as { __studioModules?: Record<string, unknown> }).__studioModules = SHARED_MODULES;

export type SceneComponent = React.ComponentType<Record<string, unknown>>;

type Entry =
  | { status: "loading"; promise: Promise<SceneComponent> }
  | { status: "ready"; component: SceneComponent }
  | { status: "error"; error: Error };

const modules = new Map<string, Entry>();

function pickComponent(exports: Record<string, unknown> | undefined): SceneComponent {
  if (!exports) throw new Error("The scene file didn't export anything.");
  if (typeof exports.default === "function" || (typeof exports.default === "object" && exports.default !== null)) {
    return exports.default as SceneComponent;
  }
  const named = Object.values(exports).find((v) => typeof v === "function");
  if (!named) throw new Error("The scene file has no component. Add `export default function Scene() { … }`.");
  return named as SceneComponent;
}

export function loadScene(url: string): Promise<SceneComponent> {
  const existing = modules.get(url);
  if (existing?.status === "ready") return Promise.resolve(existing.component);
  if (existing?.status === "loading") return existing.promise;
  if (existing?.status === "error") return Promise.reject(existing.error);
  const promise = (async () => {
    const response = await fetch(url);
    const text = await response.text();
    if (!response.ok) {
      let message = text;
      try {
        message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text;
      } catch {
        // plain-text error
      }
      throw new Error(message || `Couldn't load the scene (${response.status}).`);
    }
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const exports = new Function(`${text}\n;return typeof __studioScene === "undefined" ? undefined : __studioScene;`)() as Record<string, unknown> | undefined;
    return pickComponent(exports);
  })();
  modules.set(url, { status: "loading", promise });
  promise.then(
    (component) => modules.set(url, { status: "ready", component }),
    (error: unknown) => modules.set(url, { status: "error", error: error instanceof Error ? error : new Error(String(error)) }),
  );
  return promise;
}

/** Load a scene component, holding the render until it is ready. */
export function useScene(url: string): { component: SceneComponent | null; error: Error | null } {
  const initial = modules.get(url);
  const [state, setState] = useState<{ url: string; component: SceneComponent | null; error: Error | null }>(() => ({
    url,
    component: initial?.status === "ready" ? initial.component : null,
    error: initial?.status === "error" ? initial.error : null,
  }));
  const current = state.url === url ? state : { url, component: null, error: null };

  useEffect(() => {
    const entry = modules.get(url);
    if (entry?.status === "ready") {
      setState({ url, component: entry.component, error: null });
      return;
    }
    if (entry?.status === "error") {
      setState({ url, component: null, error: entry.error });
      return;
    }
    const handle = delayRender(`Loading scene ${url}`, { timeoutInMilliseconds: 120_000 });
    let alive = true;
    loadScene(url).then(
      (component) => {
        if (alive) setState({ url, component, error: null });
        continueRender(handle);
      },
      (error: Error) => {
        if (alive) setState({ url, component: null, error });
        // A broken scene must fail the export loudly; the preview shows it instead.
        if (getRemotionEnvironment().isRendering) cancelRender(error);
        else continueRender(handle);
      },
    );
    return () => {
      alive = false;
    };
  }, [url]);

  return { component: current.component, error: current.error };
}

/** Keeps a crashing scene from taking down the whole preview. */
export class SceneErrorBoundary extends React.Component<{ name: string; children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    if (getRemotionEnvironment().isRendering) cancelRender(error);
  }
  render() {
    if (this.state.error) return <SceneProblem name={this.props.name} message={this.state.error.message} />;
    return this.props.children;
  }
}

export const SceneProblem: React.FC<{ name: string; message: string }> = ({ name, message }) => (
  <Remotion.AbsoluteFill style={{ background: "#2a0f12", color: "#ffd9dc", padding: "6%", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
    <div style={{ fontSize: 34, fontWeight: 700, marginBottom: 16 }}>Scene problem: {name}</div>
    <pre style={{ fontSize: 24, whiteSpace: "pre-wrap", margin: 0, opacity: 0.85 }}>{message}</pre>
  </Remotion.AbsoluteFill>
);
