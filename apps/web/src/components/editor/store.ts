"use client";

import { useSyncExternalStore } from "react";
import { TimelineOpError, type Timeline } from "@studio/timeline";

/**
 * Editor state for the timeline (the project's project.json): the
 * committed timeline, a live "draft" used while dragging, undo/redo history
 * and autosave bookkeeping. Kept outside React so high-frequency updates
 * stay cheap.
 */

type Listener = () => void;

export interface EditorSnapshot {
  timeline: Timeline;
  /** Shown instead of `timeline` while a drag is in progress. */
  draft: Timeline | null;
  /** Version of project.json the editor is based on. */
  fingerprint: string;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  conflict: boolean;
  selected: string[];
  /** A time range picked on the timeline (seconds), e.g. to ask Claude about that part. */
  range: { start: number; end: number } | null;
  zoom: number;
  snap: boolean;
}

const HISTORY_LIMIT = 100;

export class EditorStore {
  private listeners = new Set<Listener>();
  private past: Timeline[] = [];
  private future: Timeline[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private editCounter = 0;
  private pendingSnapshot: string | null = null;
  state: EditorSnapshot;

  constructor(
    private readonly projectId: string,
    timeline: Timeline,
    fingerprint: string,
    private readonly onError: (message: string) => void,
  ) {
    this.state = {
      timeline,
      draft: null,
      fingerprint,
      canUndo: false,
      canRedo: false,
      dirty: false,
      saving: false,
      saveError: null,
      conflict: false,
      selected: [],
      range: null,
      zoom: 40,
      snap: true,
    };
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = () => this.state;

  private set(patch: Partial<EditorSnapshot>) {
    this.state = {
      ...this.state,
      ...patch,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
    };
    for (const l of this.listeners) l();
  }

  /** Apply an editing operation as one undoable step. Returns false if it was refused. */
  apply = (op: (t: Timeline) => Timeline, options: { snapshot?: string } = {}): boolean => {
    let next: Timeline;
    try {
      next = op(this.state.timeline);
    } catch (error) {
      this.onError(error instanceof TimelineOpError || error instanceof Error ? error.message : "That change isn't possible.");
      this.set({ draft: null });
      return false;
    }
    if (next === this.state.timeline) {
      this.set({ draft: null });
      return false;
    }
    this.past.push(this.state.timeline);
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
    if (options.snapshot) this.pendingSnapshot = options.snapshot;
    const selected = this.state.selected.filter((id) => next.clips.some((c) => c.id === id));
    this.set({ timeline: next, draft: null, dirty: true, selected });
    this.scheduleSave();
    return true;
  };

  /** Live preview while dragging — not saved, not in history. */
  setDraft = (draft: Timeline | null) => this.set({ draft });

  undo = () => {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.state.timeline);
    this.set({ timeline: prev, dirty: true, draft: null });
    this.scheduleSave();
  };

  redo = () => {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.state.timeline);
    this.set({ timeline: next, dirty: true, draft: null });
    this.scheduleSave();
  };

  select = (ids: string[]) => this.set({ selected: ids });
  setRange = (range: { start: number; end: number } | null) => this.set({ range });
  setZoom = (zoom: number) => this.set({ zoom: Math.min(400, Math.max(4, zoom)) });
  toggleSnap = () => this.set({ snap: !this.state.snap });

  /** Replace with the version on disk (after outside changes). Clears history. */
  load = (timeline: Timeline, fingerprint: string) => {
    this.past = [];
    this.future = [];
    const selected = this.state.selected.filter((id) => timeline.clips.some((c) => c.id === id));
    this.set({ timeline, fingerprint, selected, dirty: false, conflict: false, saveError: null, draft: null });
  };

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save(), 700);
  }

  /** Save now. `force` overwrites outside changes after a conflict. */
  save = async (force = false): Promise<void> => {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (!this.state.dirty || (this.state.saving && !force)) return;
    const counter = ++this.editCounter;
    const timeline = this.state.timeline;
    const snapshot = this.pendingSnapshot;
    this.set({ saving: true, saveError: null });
    try {
      let baseFingerprint = this.state.fingerprint;
      if (force) {
        const r = await fetch(`/api/projects/${this.projectId}/timeline?fingerprintOnly=1`).then((x) => x.json() as Promise<{ fingerprint: string }>);
        baseFingerprint = r.fingerprint;
      }
      const response = await fetch(`/api/projects/${this.projectId}/timeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeline, baseFingerprint, snapshot: snapshot ?? undefined }),
      });
      if (response.status === 409) {
        this.set({ saving: false, conflict: true });
        return;
      }
      const body = (await response.json()) as { fingerprint?: string; error?: { message: string } };
      if (!response.ok || !body.fingerprint) throw new Error(body.error?.message ?? "Couldn't save the project.");
      this.pendingSnapshot = null;
      // Only clear "dirty" if nothing changed while saving.
      const unchanged = counter === this.editCounter && this.state.timeline === timeline;
      this.set({ saving: false, fingerprint: body.fingerprint, dirty: !unchanged, conflict: false });
      if (!unchanged) this.scheduleSave();
    } catch (error) {
      this.set({ saving: false, saveError: error instanceof Error ? error.message : "Couldn't save." });
      // Try again shortly; edits are kept in memory.
      this.saveTimer = setTimeout(() => void this.save(), 5000);
    }
  };
}

export function useEditor<T>(store: EditorStore, selector: (s: EditorSnapshot) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getSnapshot()), () => selector(store.getSnapshot()));
}

/** Playback position, updated many times per second by the player. */
export class PlayheadStore {
  private listeners = new Set<Listener>();
  time = 0;
  playing = false;
  /** Set by the preview so other parts can seek / toggle playback. */
  controls: { seek: (seconds: number) => void; toggle: () => void } | null = null;

  setControls(controls: PlayheadStore["controls"]) {
    this.controls = controls;
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  update(time: number, playing = this.playing) {
    if (time === this.time && playing === this.playing) return;
    this.time = time;
    this.playing = playing;
    for (const l of this.listeners) l();
  }
  seek = (seconds: number) => {
    const t = Math.max(0, seconds);
    this.update(t);
    this.controls?.seek(t);
  };
}

export function usePlayhead(store: PlayheadStore): { time: number; playing: boolean } {
  const time = useSyncExternalStore(store.subscribe, () => store.time, () => 0);
  const playing = useSyncExternalStore(store.subscribe, () => store.playing, () => false);
  return { time, playing };
}
