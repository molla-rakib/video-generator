import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProviderError, type Transcriber, type Transcript } from "./types";

/**
 * Local Whisper through the openai-whisper command line tool
 * (`pip install -U openai-whisper`). Runs on CPU; no API key needed.
 * Bangla works best with the "medium" or "large-v3" models.
 */
export class LocalWhisper implements Transcriber {
  readonly id = "whisper-local" as const;
  readonly label = "Whisper (on this computer)";

  constructor(
    private readonly command: string = "whisper",
    private readonly model: string = "medium",
  ) {}

  private run(args: string[], timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, args, { stdio: ["ignore", "pipe", "pipe"] });
      let err = "";
      let out = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
      child.stdout.on("data", (d: Buffer) => (out += d.toString()));
      child.stderr.on("data", (d: Buffer) => {
        if (err.length < 4000) err += d.toString();
      });
      child.on("error", (e: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        reject(
          e.code === "ENOENT"
            ? new ProviderError(`Whisper isn't installed on this computer (command "${this.command}" not found). Install it with: pip install -U openai-whisper`)
            : e,
        );
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(out);
        else reject(new ProviderError("Whisper couldn't transcribe this recording.", err.slice(-800)));
      });
    });
  }

  async transcribe(options: { filePath: string; language: string }): Promise<Transcript> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "studio-whisper-"));
    try {
      await this.run(
        [
          options.filePath,
          "--model", this.model,
          "--language", options.language,
          "--task", "transcribe",
          "--output_format", "json",
          "--output_dir", dir,
          "--word_timestamps", "True",
          "--fp16", "False",
          "--verbose", "False",
        ],
        60 * 60_000,
      );
      const base = path.basename(options.filePath, path.extname(options.filePath));
      const json = JSON.parse(await readFile(path.join(dir, `${base}.json`), "utf8")) as {
        text?: string;
        language?: string;
        segments?: Array<{ start: number; end: number; text: string; words?: Array<{ start: number; end: number; word: string }> }>;
      };
      const segments = json.segments ?? [];
      return {
        text: (json.text ?? "").trim(),
        language: json.language ?? options.language,
        segments: segments.map((s) => ({ start: s.start, end: s.end, text: s.text.trim() })),
        words: segments.flatMap((s) => s.words ?? []).map((w) => ({ start: w.start, end: w.end, word: w.word.trim() })),
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async test(): Promise<string> {
    await this.run(["--help"], 60_000);
    return `Whisper is installed (model "${this.model}" will be downloaded on first use if needed).`;
  }
}
