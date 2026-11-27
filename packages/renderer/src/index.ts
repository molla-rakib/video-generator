// Browser-safe exports (the Player uses these). Server rendering lives in
// "@studio/renderer/render" and scene compiling in
// "@studio/renderer/scene-compiler", so the web bundle never pulls in Node-only code.
export { Video, compositionMetadata, BASE_RESOLUTION, type VideoProps } from "./composition";
export { loadScene } from "./scene-loader";
