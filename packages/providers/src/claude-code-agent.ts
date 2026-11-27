import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProviderError } from "./types";

/**
 * CLAUDE CODE AS THE STUDIO'S AGENT
 *
 * Runs `claude -p` inside a project folder with file tools only (read,
 * search, edit, write). Edits are accepted automatically but Claude Code
 * keeps them inside the working folder; there is no shell, web or MCP access.
 * Progress is streamed (stream-json) so the app can show what it's doing.
 */

export interface AgentEvent {
  kind: "text" | "tool";
  /** Plain-language line for the progress display. */
  message: string;
}

export interface AgentRunOptions {
  /** The project folder; Claude works only in here. */
  cwd: string;
  prompt: string;
  /** Extra system instructions (skills, contract). */
  system: string;
  command?: string;
  model?: string;
  /** Set when the user connected Claude with an API key instead of the app sign-in. */
  apiKey?: string | null;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  onEvent?: (event: AgentEvent) => void;
  shouldCancel?: () => boolean | Promise<boolean>;
  timeoutMs?: number;
}

export interface AgentRunResult {
  /** Claude's closing message to the user. */
  summary: string;
  costUsd: number | null;
  turns: number | null;
}

export class AgentCancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "AgentCancelledError";
  }
}

/** Variables Claude Code sets for its own child processes; a fresh session must not inherit them. */
function cleanEnv(apiKey: string | null | undefined): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === "CLAUDECODE" || key === "CLAUDE_PID" || key === "CLAUDE_AGENT_SDK_VERSION" || /^CLAUDE_CODE_(SESSION|CHILD|MESSAGING|ENTRYPOINT|EXECPATH|SSE)/.test(key)) {
      delete env[key];
    }
  }
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
  return env;
}

function describeTool(name: string, input: Record<string, unknown>, cwd: string): string {
  const file = typeof input.file_path === "string" ? path.relative(cwd, input.file_path).replace(/\\/g, "/") || input.file_path : null;
  switch (name) {
    case "Read":
      return file ? `Reading ${file}` : "Reading a file";
    case "Edit":
    case "MultiEdit":
      return file ? `Editing ${file}` : "Editing a file";
    case "Write":
      return file ? `Writing ${file}` : "Writing a file";
    case "Glob":
    case "Grep":
      return "Looking through the project";
    default:
      return `Using ${name}`;
  }
}

function explain(text: string, command: string): ProviderError {
  const brief = text.slice(0, 1500);
  if (/not logged in|please run \/login|invalid api key|authenticat|oauth/i.test(text)) {
    return new ProviderError(`Claude on this computer isn't signed in. Open a terminal, run "${command}", and sign in — then try again.`, brief);
  }
  if (/usage limit|rate limit|limit reached|out of (credit|usage)|429/i.test(text)) {
    return new ProviderError("Your Claude plan has hit its usage limit for now. Try again later.", brief, true);
  }
  if (/overloaded|529|timed? ?out|ECONNRESET|network/i.test(text)) {
    return new ProviderError("Claude had a problem finishing the job. Try again.", brief, true);
  }
  return new ProviderError("Claude couldn't finish the job.", brief);
}

export async function runClaudeCode(options: AgentRunOptions): Promise<AgentRunResult> {
  const command = options.command || "claude";
  const tmp = await mkdtemp(path.join(os.tmpdir(), "studio-agent-"));
  try {
    // Long instructions go through a file: Windows caps a command line at ~32K characters.
    const systemFile = path.join(tmp, "system.md");
    await writeFile(systemFile, options.system, "utf8");
    const args = [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--no-session-persistence",
      "--tools", "Read,Edit,Write,Glob,Grep",
      "--permission-mode", "acceptEdits",
      "--append-system-prompt-file", systemFile,
      "--strict-mcp-config",
      "--disable-slash-commands",
      ...(options.model ? ["--model", options.model] : []),
      ...(options.effort ? ["--effort", options.effort] : []),
    ];

    return await new Promise<AgentRunResult>((resolve, reject) => {
      const child = spawn(command, args, { cwd: options.cwd, env: cleanEnv(options.apiKey), stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      let buffer = "";
      let err = "";
      let result: { subtype?: string; is_error?: boolean; result?: string; total_cost_usd?: number; num_turns?: number } | null = null;
      let lastText = "";
      let finished = false;
      const finish = (fn: () => void) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        clearInterval(cancelWatch);
        fn();
      };

      const timer = setTimeout(() => {
        child.kill();
        finish(() => reject(new ProviderError("Claude took too long. Try a smaller change.", "timeout", true)));
      }, options.timeoutMs ?? 30 * 60_000);
      const cancelWatch = setInterval(async () => {
        if (await options.shouldCancel?.()) {
          child.kill();
          finish(() => reject(new AgentCancelledError()));
        }
      }, 1500);

      const handleLine = (line: string) => {
        if (!line.trim()) return;
        let msg: { type?: string; message?: { content?: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }> } } & Record<string, unknown>;
        try {
          msg = JSON.parse(line);
        } catch {
          return;
        }
        if (msg.type === "assistant") {
          for (const part of msg.message?.content ?? []) {
            if (part.type === "text" && part.text?.trim()) {
              lastText = part.text.trim();
              options.onEvent?.({ kind: "text", message: lastText.split("\n")[0]!.slice(0, 160) });
            }
            if (part.type === "tool_use" && part.name) options.onEvent?.({ kind: "tool", message: describeTool(part.name, part.input ?? {}, options.cwd) });
          }
        } else if (msg.type === "result") {
          result = msg as typeof result;
        }
      };

      child.stdout.on("data", (d: Buffer) => {
        buffer += d.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handleLine(line);
      });
      child.stderr.on("data", (d: Buffer) => {
        if (err.length < 8000) err += d.toString();
      });
      child.on("error", (e: NodeJS.ErrnoException) =>
        finish(() =>
          reject(
            e.code === "ENOENT" || e.code === "EINVAL"
              ? new ProviderError(`Couldn't find Claude Code on this computer (command "${command}"). Install it, or set its path in Settings.`, e.message)
              : e,
          ),
        ),
      );
      child.on("close", (code) => {
        handleLine(buffer);
        finish(() => {
          const r = result as typeof result;
          if (!r || r.is_error || r.subtype !== "success" || code !== 0) {
            reject(explain([r?.result, err].filter(Boolean).join("\n").trim() || `exit code ${code}`, command));
            return;
          }
          resolve({ summary: (r.result ?? lastText).trim(), costUsd: r.total_cost_usd ?? null, turns: r.num_turns ?? null });
        });
      });
      child.stdin.on("error", () => {
        /* the process exited early; the close handler reports why */
      });
      child.stdin.end(options.prompt);
    });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
