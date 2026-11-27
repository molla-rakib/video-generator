"use client";

import { createContext, useContext } from "react";
import type { Job, MediaAsset, Project } from "@studio/database";
import type { EditorStore, PlayheadStore } from "./store";

export interface EditorContextValue {
  project: Project;
  store: EditorStore;
  playhead: PlayheadStore;
  media: MediaAsset[];
  mediaById: Map<string, MediaAsset>;
  /** Media by project-relative path (what clips use as `src`). */
  mediaByPath: Map<string, MediaAsset>;
  /** Version of every file the timeline uses; null = missing on disk. */
  fileVersions: Record<string, string | null>;
  jobs: Job[];
  refreshMedia: () => Promise<void>;
  refreshJobs: () => Promise<void>;
  /** Start a background task (export…). */
  startJob: (type: string, input?: Record<string, unknown>) => Promise<Job | null>;
  /** Upload files to the project's media folder. */
  upload: (files: File[], extra?: { role?: string }) => Promise<void>;
  /** Select a clip so the Clip settings panel shows it. */
  inspect: (clipId: string) => void;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorContext(): EditorContextValue {
  const value = useContext(EditorContext);
  if (!value) throw new Error("useEditorContext must be used inside the editor");
  return value;
}

/** True while a task of one of these types is waiting or running. */
export function isBusy(jobs: Job[], ...types: string[]): Job | undefined {
  return jobs.find((j) => types.includes(j.type) && (j.status === "pending" || j.status === "running"));
}

export function mediaUrl(assetId: string, variant: "file" | "thumb" | "waveform" | "strip" | "download" = "file"): string {
  return `/api/media/${assetId}/${variant}`;
}

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

/** URL of a file inside the project folder. */
export function projectFileUrl(projectId: string, path: string, version?: string | null): string {
  return `/api/projects/${projectId}/files/${encodePath(path)}${version ? `?v=${encodeURIComponent(version)}` : ""}`;
}
