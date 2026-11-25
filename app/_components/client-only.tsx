"use client";

import dynamic from "next/dynamic";

const Pulse = () => <div className="h-full w-full animate-pulse bg-white/5" />;

/** Remotion components are browser-only, so they're never prerendered. */
export const DocPlayer = dynamic(() => import("./DocPlayer"), { ssr: false, loading: Pulse });
export const DocThumb = dynamic(() => import("./DocPlayer").then((m) => m.DocThumb), { ssr: false, loading: Pulse });
