import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: [
    "@studio/shared",
    "@studio/timeline",
    "@studio/database",
    "@studio/media",
    "@studio/providers",
    "@studio/renderer",
  ],
  serverExternalPackages: ["@anthropic-ai/sdk", "esbuild"],
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },
};

export default nextConfig;
