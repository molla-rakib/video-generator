// Starts the web app and the background worker together, with labelled output.
import { spawn, spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";

const procs = [
  { name: "web", color: 36, args: ["run", "dev", "-w", "@studio/web"] },
  { name: "worker", color: 35, args: ["run", "dev", "-w", "@studio/worker"] },
];

const children = procs.map(({ name, color, args }) => {
  // Node refuses to spawn .cmd files on Windows without a shell (CVE-2024-27980 → spawn EINVAL).
  // Args are fixed literals, so passing one command string to the shell is safe (and avoids DEP0190).
  const opts = { stdio: ["ignore", "pipe", "pipe"], env: process.env };
  const child = isWindows ? spawn(`npm.cmd ${args.join(" ")}`, { ...opts, shell: true }) : spawn("npm", args, opts);
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) out.write(prefix + line + "\n");
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    console.log(`${prefix}exited with code ${code}`);
    shutdown(code ?? 0);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    // On Windows, kill() only stops the shell wrapper; take down the whole tree so next dev releases its port.
    if (isWindows && c.pid) spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
    else c.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 1500);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
