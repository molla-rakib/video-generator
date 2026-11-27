import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "@studio/media";

/**
 * BUILT-IN SKILLS
 *
 * Instructions that ship with the app (`<repo>/skills/<name>/SKILL.md`) and
 * are given to the AI agent on every job: how projects are built, and the
 * studio's house style (e.g. shots flow into each other).
 */

export interface Skill {
  id: string;
  name: string;
  description: string;
  /** The instructions, without the front matter. */
  body: string;
  builtIn: boolean;
}

export const builtInSkillsDir = () => path.join(/*turbopackIgnore: true*/ repoRoot(), "skills");

function parseSkill(id: string, text: string, builtIn: boolean): Skill {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  const front = match?.[1] ?? "";
  const field = (key: string) => new RegExp(`^${key}:\\s*(.+)$`, "m").exec(front)?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
  return { id, name: field("name") || id, description: field("description"), body: (match?.[2] ?? text).trim(), builtIn };
}

export async function listBuiltInSkills(): Promise<Skill[]> {
  const dir = builtInSkillsDir();
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const skills: Skill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const text = await readFile(path.join(dir, entry.name, "SKILL.md"), "utf8").catch(() => null);
    if (text) skills.push(parseSkill(entry.name, text, true));
  }
  // Basics first: the others build on it.
  return skills.sort((a, b) => (a.id === "studio-basics" ? -1 : b.id === "studio-basics" ? 1 : a.id.localeCompare(b.id)));
}
