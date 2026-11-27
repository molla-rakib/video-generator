"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  AudioWaveform,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Copy,
  Database,
  ExternalLink,
  FolderOpen,
  KeyRound,
  Lightbulb,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type { ProviderSettingView } from "@studio/database";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type ClaudeConnection = "cli" | "apiKey";
type ProviderView = ProviderSettingView & {
  fromEnvironment: boolean;
  connection?: ClaudeConnection;
};
interface SettingsData {
  storage: { projects: string; secrets: string; database: string };
  skills: Array<{ id: string; name: string; description: string }>;
  providers: Record<string, ProviderView>;
}

const SKILL_COLORS = ["bg-sky-500/15 text-sky-300", "bg-emerald-500/15 text-emerald-300", "bg-rose-500/15 text-rose-300", "bg-amber-500/15 text-amber-300"];

function SkillsList({ skills }: { skills: SettingsData["skills"] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {skills.map((s, i) => (
        <div key={s.id} className="flex gap-3 rounded-xl border bg-card p-4 shadow-xs">
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", SKILL_COLORS[i % SKILL_COLORS.length])}>
            <BookOpen className="size-4" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="flex items-center gap-2 text-sm font-medium">
              {s.name.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase())}
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">Built in</span>
            </p>
            <p className="text-sm text-muted-foreground">{s.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SettingsForm() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [open, setOpen] = useState<"claude" | "elevenlabs" | null>(null);
  const load = useCallback(
    async () => setData(await api<SettingsData>("/api/settings")),
    [],
  );
  useEffect(() => {
    let alive = true;
    api<SettingsData>("/api/settings")
      .then((d) => alive && setData(d))
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Couldn't load settings."),
      );
    return () => {
      alive = false;
    };
  }, []);

  if (!data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const claude = data.providers.anthropic!;
  const eleven = data.providers.elevenlabs!;
  const elevenConnected = eleven.hasKey || eleven.fromEnvironment;

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <SectionTitle
          title="Connections"
          description="The services that make your cartoon. Only Claude is needed."
        />

        <ServiceCard
          tile="from-orange-400 to-amber-500"
          icon={<Bot className="size-5" />}
          title="Claude Code"
          tag={{ label: "Required", tone: "orange" }}
          description="Your AI animator. It reads the subtitles, writes the scenes and animation, and checks its own work."
          status={
            claude.lastTest
              ? claude.lastTest.ok
                ? "connected"
                : "error"
              : "unchecked"
          }
          statusText={claude.lastTest?.message}
          action={claude.lastTest?.ok ? "Manage" : "Connect"}
          onAction={() => setOpen("claude")}
        />

        <ServiceCard
          tile="from-slate-300 to-slate-400"
          icon={<Sparkles className="size-5" />}
          title="GPT (Codex)"
          tag={{ label: "Coming later", tone: "slate" }}
          description="Another AI animator option. It will appear here when it's ready."
          muted
        />

        <ServiceCard
          tile="from-violet-500 to-fuchsia-500"
          icon={<AudioWaveform className="size-5" />}
          title="ElevenLabs"
          tag={{ label: "Optional", tone: "violet" }}
          description="Used only for sound effects and background music. Your voiceover is never sent or changed."
          status={
            elevenConnected
              ? eleven.lastTest
                ? eleven.lastTest.ok
                  ? "connected"
                  : "error"
                : "unchecked"
              : "off"
          }
          statusText={elevenConnected ? eleven.lastTest?.message : undefined}
          action={elevenConnected ? "Manage" : "Connect"}
          onAction={() => setOpen("elevenlabs")}
        >
          {!elevenConnected ? (
            <Note tone="violet">
              Not connected — that’s fine.{" "}
              <strong>
                Claude will create the sound effects and music itself.
              </strong>{" "}
              Connect ElevenLabs if you want more realistic sounds (rain,
              trains, crowds…) and richer music.
            </Note>
          ) : null}
        </ServiceCard>
      </section>

      {data.skills.length ? (
        <section className="space-y-3">
          <SectionTitle title="Built-in skills" description="House rules Claude follows in every video and every change you ask for." />
          <SkillsList skills={data.skills} />
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionTitle
          title="Where your files are stored"
          description="Everything stays on this computer."
        />
        <StorageCard storage={data.storage} />
      </section>

      <ClaudeDialog
        open={open === "claude"}
        onOpenChange={(o) => setOpen(o ? "claude" : null)}
        view={claude}
        onChanged={load}
      />
      <ElevenLabsDialog
        open={open === "elevenlabs"}
        onOpenChange={(o) => setOpen(o ? "elevenlabs" : null)}
        view={eleven}
        onChanged={load}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

type Status = "connected" | "error" | "unchecked" | "off";

const STATUS: Record<
  Status,
  { label: string; className: string; icon: React.ReactNode }
> = {
  connected: {
    label: "Connected",
    className: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
    icon: <CheckCircle2 className="size-3.5" />,
  },
  error: {
    label: "Not working",
    className: "bg-red-500/10 text-red-300 ring-red-500/30",
    icon: <AlertCircle className="size-3.5" />,
  },
  unchecked: {
    label: "Not checked yet",
    className: "bg-amber-500/10 text-amber-200 ring-amber-500/30",
    icon: <CircleDashed className="size-3.5" />,
  },
  off: {
    label: "Not connected",
    className: "bg-slate-500/15 text-slate-400 ring-slate-500/30",
    icon: <CircleDashed className="size-3.5" />,
  },
};

const TAG_TONES = {
  orange: "bg-orange-500/15 text-orange-200",
  violet: "bg-violet-500/15 text-violet-200",
  slate: "bg-slate-500/15 text-slate-400",
};

function StatusPill({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        s.className,
      )}
    >
      {s.icon}
      {s.label}
    </span>
  );
}

function ServiceCard(props: {
  tile: string;
  icon: React.ReactNode;
  title: string;
  tag: { label: string; tone: keyof typeof TAG_TONES };
  description: string;
  status?: Status;
  statusText?: string;
  action?: string;
  onAction?: () => void;
  muted?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 shadow-xs",
        props.muted && "border-dashed bg-surface shadow-none",
      )}
    >
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm",
            props.tile,
            props.muted && "opacity-60",
          )}
        >
          {props.icon}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={cn(
                "font-semibold",
                props.muted && "text-muted-foreground",
              )}
            >
              {props.title}
            </h3>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                TAG_TONES[props.tag.tone],
              )}
            >
              {props.tag.label}
            </span>
            {props.status ? <StatusPill status={props.status} /> : null}
          </div>
          <p className="text-sm text-muted-foreground">{props.description}</p>
          {props.statusText ? (
            <p
              className={cn(
                "text-xs",
                props.status === "error" ? "text-red-300" : "text-emerald-300",
              )}
            >
              {props.statusText}
            </p>
          ) : null}
        </div>
        {props.action ? (
          <Button
            variant={props.action === "Connect" ? "default" : "outline"}
            size="sm"
            onClick={props.onAction}
            className="shrink-0"
          >
            {props.action} <ChevronRight />
          </Button>
        ) : null}
      </div>
      {props.children ? (
        <div className="mt-3 sm:pl-15">{props.children}</div>
      ) : null}
    </div>
  );
}

/** A coloured note. Blue "how to" boxes hold instructions. */
function Note({
  tone,
  title,
  children,
}: {
  tone: "blue" | "violet" | "amber";
  title?: string;
  children: React.ReactNode;
}) {
  const tones = {
    blue: "border-sky-500/30 bg-sky-500/10 text-sky-100 [&_svg.note-icon]:text-sky-400",
    violet:
      "border-violet-500/30 bg-violet-500/10 text-violet-100 [&_svg.note-icon]:text-violet-400",
    amber:
      "border-amber-500/30 bg-amber-500/10 text-amber-100 [&_svg.note-icon]:text-amber-400",
  };
  return (
    <div
      className={cn("flex gap-2.5 rounded-lg border p-3 text-sm", tones[tone])}
    >
      <Lightbulb className="note-icon mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className="leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function Steps({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="space-y-1.5">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[11px] font-semibold text-white">
            {i + 1}
          </span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

function Code({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-black/30 px-1.5 py-0.5 font-mono text-[12px] ring-1 ring-sky-500/30">
      {children}
      <button
        type="button"
        className="text-sky-400 hover:text-sky-200"
        onClick={() =>
          void navigator.clipboard
            .writeText(children)
            .then(() => toast.success("Copied"))
        }
        aria-label={`Copy ${children}`}
      >
        <Copy className="size-3" />
      </button>
    </span>
  );
}

function TestResult({ view }: { view: ProviderView }) {
  if (!view.lastTest) return null;
  return (
    <div
      className={cn(
        "flex gap-2 rounded-lg border p-3 text-sm",
        view.lastTest.ok
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          : "border-red-500/30 bg-red-500/10 text-red-200",
      )}
    >
      {view.lastTest.ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
      ) : (
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
      )}
      {view.lastTest.message}
    </div>
  );
}

async function saveAndTest(
  target: string,
  body: { apiKey?: string | null; options?: Record<string, string | null> },
): Promise<boolean> {
  await api("/api/settings", { method: "PUT", json: { target, ...body } });
  const r = await api<{ ok: boolean; message: string }>("/api/settings/test", {
    method: "POST",
    json: { provider: target },
  });
  if (r.ok) toast.success(r.message);
  else toast.error(r.message);
  return r.ok;
}

// ---------------------------------------------------------------------------
// Claude Code
// ---------------------------------------------------------------------------

interface DialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  view: ProviderView;
  onChanged: () => Promise<void>;
}

/** The form lives inside DialogContent, which unmounts on close — so it starts fresh each time. */
function ClaudeDialog(props: DialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <ClaudeForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

function ClaudeForm({ onOpenChange, view, onChanged }: DialogProps) {
  const [mode, setMode] = useState<ClaudeConnection>(view.connection ?? "cli");
  const [key, setKey] = useState("");
  const [command, setCommand] = useState(String(view.options.command ?? ""));
  const [model, setModel] = useState(String(view.options.model ?? ""));
  const [busy, setBusy] = useState(false);

  async function check() {
    if (
      mode === "apiKey" &&
      !key.trim() &&
      !view.hasKey &&
      !view.fromEnvironment
    )
      return toast.error("Paste your Anthropic API key first.");
    setBusy(true);
    try {
      const ok = await saveAndTest("anthropic", {
        apiKey: mode === "apiKey" && key.trim() ? key.trim() : undefined,
        options: {
          connection: mode,
          command: command.trim() || null,
          model: model.trim() || null,
        },
      });
      await onChanged();
      if (ok) onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't check the connection.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-amber-500 text-white">
            <Bot className="size-4" />
          </span>
          {view.lastTest?.ok ? "Claude Code" : "Connect Claude Code"}
        </DialogTitle>
        <DialogDescription>
          Claude makes your cartoon. Use the Claude app on this computer — no
          API key needed.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-2">
        {(
          [
            {
              id: "cli",
              label: "This computer",
              hint: "Recommended · uses your Claude plan",
            },
            {
              id: "apiKey",
              label: "API key",
              hint: "Billed to your Anthropic account",
            },
          ] as const
        ).map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setMode(o.id)}
            aria-pressed={mode === o.id}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors hover:bg-surface",
              mode === o.id &&
                "border-orange-500/40 bg-orange-500/10 ring-1 ring-orange-500/40",
            )}
          >
            <span className="block text-sm font-medium">{o.label}</span>
            <span className="block text-xs text-muted-foreground">
              {o.hint}
            </span>
          </button>
        ))}
      </div>

      {mode === "cli" ? (
        <Note tone="blue" title="How to connect">
          <Steps
            steps={[
              <>
                Install Claude Code once:{" "}
                <Code>npm install -g @anthropic-ai/claude-code</Code>
              </>,
              <>
                Open a terminal, type <Code>claude</Code> and sign in with your
                Claude account.
              </>,
              <>Come back here and press “Check connection”.</>,
            ]}
          />
        </Note>
      ) : (
        <div className="space-y-3">
          <Note tone="blue" title="How to get a key">
            <Steps
              steps={[
                <>
                  Open the{" "}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline"
                  >
                    Anthropic Console <ExternalLink className="inline size-3" />
                  </a>{" "}
                  and create an API key.
                </>,
                <>Paste it below and press “Check connection”.</>,
              ]}
            />
          </Note>
          <div className="space-y-1.5">
            <Label htmlFor="claude-key">Anthropic API key</Label>
            <Input
              id="claude-key"
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={
                view.fromEnvironment
                  ? "Set by an environment variable"
                  : view.hasKey
                    ? `Saved (${view.keyHint})`
                    : "sk-ant-…"
              }
            />
          </div>
        </div>
      )}

      <details className="group rounded-lg border px-3 py-2 text-sm">
        <summary className="cursor-pointer text-muted-foreground select-none">
          Advanced
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {mode === "cli" ? (
            <div className="space-y-1.5">
              <Label htmlFor="claude-command">Claude command</Label>
              <Input
                id="claude-command"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="claude"
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="claude-model">Model</Label>
            <Input
              id="claude-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Default"
            />
          </div>
        </div>
      </details>

      <TestResult view={view} />

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Close
        </Button>
        <Button onClick={() => void check()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Check
          connection
        </Button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// ElevenLabs
// ---------------------------------------------------------------------------

function ElevenLabsDialog(props: DialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <ElevenLabsForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

function ElevenLabsForm({ onOpenChange, view, onChanged }: DialogProps) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const connected = view.hasKey || view.fromEnvironment;

  async function connect() {
    if (!key.trim() && !connected)
      return toast.error("Paste your ElevenLabs API key first.");
    setBusy(true);
    try {
      const ok = await saveAndTest("elevenlabs", {
        apiKey: key.trim() ? key.trim() : undefined,
      });
      await onChanged();
      if (ok) onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't connect.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await api("/api/settings", {
        method: "PUT",
        json: { target: "elevenlabs", apiKey: null },
      });
      toast.success(
        "ElevenLabs disconnected. Claude will create sounds and music itself.",
      );
      await onChanged();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't disconnect.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
            <AudioWaveform className="size-4" />
          </span>
          {connected ? "ElevenLabs" : "Connect ElevenLabs"}
        </DialogTitle>
        <DialogDescription>
          Optional. Used only for sound effects and background music.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-3">
          <p className="font-medium text-violet-200">With ElevenLabs</p>
          <p className="text-xs text-violet-200">
            Realistic sound effects and generated music.
          </p>
        </div>
        <div className="rounded-lg border bg-surface p-3">
          <p className="font-medium">Without it</p>
          <p className="text-xs text-muted-foreground">
            Claude creates the sounds and music itself.
          </p>
        </div>
      </div>

      {!connected ? (
        <Note tone="blue" title="How to get a key">
          <Steps
            steps={[
              <>
                Sign in at{" "}
                <a
                  href="https://elevenlabs.io/app/settings/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline"
                >
                  elevenlabs.io → API Keys{" "}
                  <ExternalLink className="inline size-3" />
                </a>
              </>,
              <>
                Create a key. It only needs access to{" "}
                <strong>Sound Effects</strong> and <strong>Music</strong>.
              </>,
              <>Paste it below and press “Connect”.</>,
            ]}
          />
        </Note>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="eleven-key" className="flex items-center gap-1.5">
          <KeyRound className="size-3.5 text-muted-foreground" />{" "}
          {connected ? "Replace the key" : "ElevenLabs API key"}
        </Label>
        <Input
          id="eleven-key"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={
            view.fromEnvironment
              ? "Set by an environment variable"
              : view.hasKey
                ? `Saved (${view.keyHint})`
                : "Paste your key"
          }
        />
        <p className="text-xs text-muted-foreground">
          Stored encrypted on this computer. It never reaches the browser or the
          AI agent.
        </p>
      </div>

      <TestResult view={view} />

      <div className="flex items-center gap-2">
        {view.hasKey ? (
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() => void disconnect()}
            disabled={busy}
          >
            Disconnect
          </Button>
        ) : null}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={() => void connect()}
            disabled={busy}
            className="bg-violet-600 text-white hover:bg-violet-700"
          >
            {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}{" "}
            {connected && !key.trim() ? "Check connection" : "Connect"}
          </Button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function StorageCard({ storage }: { storage: SettingsData["storage"] }) {
  const sep = storage.projects.includes("\\") ? "\\" : "/";
  const rows = [
    {
      icon: <FolderOpen className="size-4" />,
      tile: "bg-sky-500/15 text-sky-300",
      title: "Projects and media files",
      text: "Each project has its own folder: your uploads (media), scenes, music and sound effects (audio), exported videos (exports) and project.json — the editable timeline.",
      path: `${storage.projects}${sep}<project>${sep}`,
      copy: storage.projects,
    },
    {
      icon: <Database className="size-4" />,
      tile: "bg-emerald-500/15 text-emerald-300",
      title: "Project list, file details and settings",
      text: `${storage.database} (runs in Docker on this computer).`,
    },
    {
      icon: <KeyRound className="size-4" />,
      tile: "bg-amber-500/15 text-amber-300",
      title: "API keys",
      text: "Saved encrypted in the database. The encryption key is in this folder — keep it private:",
      path: storage.secrets,
      copy: storage.secrets,
    },
  ];
  return (
    <div className="divide-y rounded-xl border bg-card shadow-xs">
      {rows.map((r) => (
        <div key={r.title} className="flex gap-3 p-4">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              r.tile,
            )}
          >
            {r.icon}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium">{r.title}</p>
            <p className="text-sm text-muted-foreground">{r.text}</p>
            {r.path ? (
              <div className="flex items-center gap-2">
                <code
                  className="min-w-0 truncate rounded-md bg-surface px-2 py-1 font-mono text-xs ring-1 ring-border"
                  title={r.path}
                >
                  {r.path}
                </code>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copy path"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(r.copy!)
                      .then(() => toast.success("Path copied"))
                  }
                >
                  <Copy />
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
