"use client";

import { createContext, useContext } from "react";
import type { Job, MediaAsset, Project, StoredScript } from "@studio/database";
import type { Script } from "@studio/timeline";
import type { EditorStore, PlayheadStore } from "./store";

export interface EditorContextValue {
  project: Project;
  store: EditorStore;
  playhead: PlayheadStore;
  media: MediaAsset[];
  mediaById: Map<string, MediaAsset>;
  jobs: Job[];
  script: StoredScript;
  /** Save script edits (debounced by the caller). */
  saveScript: (script: Script) => Promise<void>;
  refreshMedia: () => Promise<void>;
  refreshScript: () => Promise<void>;
  refreshJobs: () => Promise<void>;
  /** Start a background task (voice, subtitles, render…). */
  startJob: (type: string, input?: Record<string, unknown>) => Promise<Job | null>;
  /** Upload files to the project. */
  upload: (files: File[], extra?: { role?: string; sceneId?: string; shotId?: string }) => Promise<void>;
  inspect: (clipId: string) => void;
  setLeftTab: (tab: "script" | "media" | "clip") => void;
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
