// Browser-safe exports (the Player uses these). Server rendering lives in
// "@studio/renderer/render" so the web bundle never pulls in Node-only code.
export { Documentary, compositionMetadata, type DocumentaryProps, type MediaRef } from "./composition";
