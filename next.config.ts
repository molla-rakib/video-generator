import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  // Remotion's bundler/renderer run in Node (webpack, esbuild, Chrome) and must not be bundled by Next.
  serverExternalPackages: ["@remotion/bundler", "@remotion/renderer", "@remotion/compositor-win32-x64-msvc", "esbuild"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
