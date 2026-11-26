import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat, rename } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { mediaRoot } from "./paths";

/**
 * Storage adapter. Everything outside this module refers to files by a
 * STORAGE KEY — a relative, forward-slash path such as
 * "projects/<id>/audio/VO_001.wav". Only the adapter knows where keys live,
 * so local disk can later be swapped for S3/GCS without touching callers.
 */
export interface StorageAdapter {
  /** Write a file. Writes are atomic: readers never see a partial file. */
  put(key: string, data: Buffer | Uint8Array | Readable | ReadableStream<Uint8Array>): Promise<{ sizeBytes: number }>;
  /** Stream a file, optionally a byte range (inclusive). */
  read(key: string, range?: { start: number; end: number }): Readable;
  stat(key: string): Promise<{ sizeBytes: number; modifiedAt: Date } | null>;
  delete(key: string): Promise<void>;
  /** Remove everything under a prefix, e.g. a deleted project's folder. */
  deletePrefix(prefix: string): Promise<void>;
  /**
   * Absolute local path for tools that need a real file (FFmpeg, Remotion).
   * Cloud adapters would download to a temp file here.
   */
  localPath(key: string): Promise<string>;
}

export class InvalidStorageKeyError extends Error {
  constructor(key: string) {
    super(`Invalid storage key: ${JSON.stringify(key)}`);
    this.name = "InvalidStorageKeyError";
  }
}

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * Validate and normalise a storage key. Rejects absolute paths, "..",
 * backslashes, empty segments and unusual characters, so a key can never
 * escape the storage root.
 */
export function normaliseKey(key: string): string {
  if (typeof key !== "string" || key.length === 0 || key.length > 512) throw new InvalidStorageKeyError(key);
  const segments = key.split("/");
  for (const segment of segments) {
    if (!SAFE_SEGMENT.test(segment) || segment === "." || segment === "..") throw new InvalidStorageKeyError(key);
  }
  return segments.join("/");
}

/** Turn any user-supplied file name into a safe single key segment. */
export function safeFileName(name: string, fallback = "file"): string {
  const ext = path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10);
  const base = path
    .basename(name, path.extname(name))
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || fallback}${ext}`;
}

/** Build a key inside a project's folder. */
export function projectKey(projectId: string, category: string, fileName: string): string {
  return normaliseKey(`projects/${projectId}/${category}/${fileName}`);
}

export class LocalDiskStorage implements StorageAdapter {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    const full = path.resolve(this.root, ...normaliseKey(key).split("/"));
    // Belt and braces: normaliseKey already prevents escaping the root.
    if (!full.startsWith(this.root + path.sep)) throw new InvalidStorageKeyError(key);
    return full;
  }

  async put(key: string, data: Buffer | Uint8Array | Readable | ReadableStream<Uint8Array>): Promise<{ sizeBytes: number }> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${randomUUID()}.partial`;
    try {
      const source =
        data instanceof Readable
          ? data
          : data instanceof Uint8Array
            ? Readable.from([data])
            : Readable.fromWeb(data as import("node:stream/web").ReadableStream<Uint8Array>);
      await pipeline(source, createWriteStream(temp));
      await rename(temp, target);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
    const info = await stat(target);
    return { sizeBytes: info.size };
  }

  read(key: string, range?: { start: number; end: number }): Readable {
    return createReadStream(this.resolve(key), range);
  }

  async stat(key: string): Promise<{ sizeBytes: number; modifiedAt: Date } | null> {
    try {
      const info = await stat(this.resolve(key));
      return info.isFile() ? { sizeBytes: info.size, modifiedAt: info.mtime } : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async deletePrefix(prefix: string): Promise<void> {
    await rm(this.resolve(prefix), { recursive: true, force: true });
  }

  async localPath(key: string): Promise<string> {
    return this.resolve(key);
  }
}

let defaultStorage: StorageAdapter | null = null;

/** The configured storage adapter (local disk under mediaRoot()). */
export function getStorage(): StorageAdapter {
  defaultStorage ??= new LocalDiskStorage(mediaRoot());
  return defaultStorage;
}
