import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseFfprobe } from "./probe";
import { InvalidStorageKeyError, LocalDiskStorage, normaliseKey, projectKey, safeFileName } from "./storage";

describe("storage keys", () => {
  it("accepts normal keys", () => {
    expect(normaliseKey("projects/abc/audio/VO_001.wav")).toBe("projects/abc/audio/VO_001.wav");
    expect(projectKey("p1", "audio", "VO_001.wav")).toBe("projects/p1/audio/VO_001.wav");
  });

  it.each(["", "/etc/passwd", "../x", "a/../../b", "a//b", "a\\b", "a/./b", "a/b c", "a/ü"])("rejects %j", (key) => {
    expect(() => normaliseKey(key)).toThrow(InvalidStorageKeyError);
  });

  it("makes safe file names", () => {
    expect(safeFileName("My Narration (final).WAV")).toBe("My-Narration-final.wav");
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("???.mp3")).toBe("file.mp3");
  });
});

describe("LocalDiskStorage", () => {
  let dir: string;
  let storage: LocalDiskStorage;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "studio-storage-"));
    storage = new LocalDiskStorage(dir);
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes, stats, reads ranges and deletes", async () => {
    const key = "projects/p1/audio/test.txt";
    const { sizeBytes } = await storage.put(key, Buffer.from("hello world"));
    expect(sizeBytes).toBe(11);
    expect((await storage.stat(key))?.sizeBytes).toBe(11);

    const chunks: Buffer[] = [];
    for await (const chunk of storage.read(key, { start: 6, end: 10 })) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe("world");

    await storage.deletePrefix("projects/p1");
    expect(await storage.stat(key)).toBeNull();
  });

  it("refuses to resolve outside the root", async () => {
    await expect(storage.localPath("../outside.txt")).rejects.toThrow(InvalidStorageKeyError);
  });
});

describe("parseFfprobe", () => {
  it("reads duration and dimensions", () => {
    const info = parseFfprobe({
      format: { duration: "12.345678", format_name: "mov,mp4" },
      streams: [
        { codec_type: "video", width: 1920, height: 1080 },
        { codec_type: "audio" },
      ],
    });
    expect(info).toEqual({ durationSeconds: 12.346, width: 1920, height: 1080, hasAudio: true, hasVideo: true, formatName: "mov,mp4" });
  });

  it("treats images as having no duration", () => {
    expect(parseFfprobe({ format: { format_name: "png_pipe" }, streams: [{ codec_type: "video", width: 10, height: 10 }] }).durationSeconds).toBeNull();
  });
});
