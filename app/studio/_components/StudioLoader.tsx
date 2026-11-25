"use client";

import dynamic from "next/dynamic";

/** The studio reads the project from the URL and localStorage, so it renders in the browser only. */
export const StudioLoader = dynamic(() => import("./Studio").then((m) => m.Studio), {
  ssr: false,
  loading: () => <div className="grid min-h-screen place-items-center text-zinc-500">Loading studio…</div>,
});
