import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { getStorage } from "@studio/media";
import { UserFacingError } from "@studio/shared";
import { projectFile } from "./project-file";

/**
 * Whole-project backups taken before the AI agent changes anything:
 * project.json plus the scenes folder, in history/<stamp>_before-claude/.
 * Restoring puts both back, so "Undo" also undoes scene edits.
 */

const exists = (p: string) => stat(p).then(() => true, () => false);

export async function projectDirectory(projectId: string): Promise<string> {
  return path.dirname(await getStorage().localPath(projectFile(projectId, "project.json")));
}

export async function backupProject(projectId: string): Promise<string> {
  const dir = await projectDirectory(projectId);
  const name = `${new Date().toISOString().replace(/[:.]/g, "-")}_before-claude`;
  const target = path.join(dir, "history", name);
  await mkdir(target, { recursive: true });
  await cp(path.join(dir, "project.json"), path.join(target, "project.json"));
  if (await exists(path.join(dir, "scenes"))) await cp(path.join(dir, "scenes"), path.join(target, "scenes"), { recursive: true });
  return name;
}

/**
 * Put a backup back. `scenes: false` restores only the timeline and keeps
 * scene files written since — used when a generation fails, so a retry can
 * reuse the work already done.
 */
export async function restoreProjectBackup(projectId: string, name: string, options: { scenes?: boolean } = {}): Promise<void> {
  if (!/^[\w-]+_before-claude$/.test(name)) throw new UserFacingError("That backup name isn't valid.");
  const dir = await projectDirectory(projectId);
  const source = path.join(dir, "history", name);
  if (!(await exists(path.join(source, "project.json")))) throw new UserFacingError("That backup no longer exists.", "not_found", 404);
  if (options.scenes !== false && (await exists(path.join(source, "scenes")))) {
    await rm(path.join(dir, "scenes"), { recursive: true, force: true });
    await cp(path.join(source, "scenes"), path.join(dir, "scenes"), { recursive: true });
  }
  await cp(path.join(source, "project.json"), path.join(dir, "project.json"));
}
