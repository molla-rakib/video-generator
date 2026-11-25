/**
 * Projects are kept in the browser (localStorage) until accounts + a database
 * exist. Every AI edit pushes the previous version onto `history` for undo.
 */
import { SAMPLES } from "../samples";
import { parseDocSpec, type DocSpec, type Ratio } from "../spec/schema";

export type Project = {
  id: string;
  title: string;
  prompt: string;
  ratio: Ratio;
  createdAt: number;
  updatedAt: number;
  spec: DocSpec;
  /** Previous versions, newest last (max 15). */
  history: DocSpec[];
  /** Built-in examples are read-only until edited (then they're copied). */
  sample?: boolean;
};

const INDEX_KEY = "storymotion:projects";
const key = (id: string) => `storymotion:project:${id}`;

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    // storage full or blocked — the project stays in memory for this session
  }
}

export function newProjectId() {
  return Math.random().toString(36).slice(2, 10);
}

export function listProjects(): Pick<Project, "id" | "title" | "prompt" | "ratio" | "updatedAt">[] {
  try {
    return (JSON.parse(safeGet(INDEX_KEY) ?? "[]") as Pick<Project, "id" | "title" | "prompt" | "ratio" | "updatedAt">[]).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function loadProject(id: string): Project | null {
  if (id.startsWith("sample:")) {
    const s = SAMPLES.find((x) => `sample:${x.id}` === id);
    if (!s) return null;
    return { id, title: s.spec.meta.title, prompt: s.prompt, ratio: "16:9", createdAt: 0, updatedAt: 0, spec: s.spec, history: [], sample: true };
  }
  try {
    const raw = safeGet(key(id));
    if (!raw) return null;
    const p = JSON.parse(raw) as Project;
    return { ...p, spec: parseDocSpec(p.spec) };
  } catch {
    return null;
  }
}

export function saveProject(p: Project) {
  safeSet(key(p.id), JSON.stringify({ ...p, history: p.history.slice(-15) }));
  const index = listProjects().filter((x) => x.id !== p.id);
  index.push({ id: p.id, title: p.title, prompt: p.prompt, ratio: p.ratio, updatedAt: p.updatedAt });
  safeSet(INDEX_KEY, JSON.stringify(index));
}

export function deleteProject(id: string) {
  try {
    localStorage.removeItem(key(id));
  } catch {
    // ignore
  }
  safeSet(INDEX_KEY, JSON.stringify(listProjects().filter((x) => x.id !== id)));
}
