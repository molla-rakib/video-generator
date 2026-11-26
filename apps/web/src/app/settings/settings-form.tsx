"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { ProviderSettingView } from "@studio/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type ProviderView = ProviderSettingView & { fromEnvironment: boolean };
interface SettingsData {
  choices: { brain: "anthropic" | "openai" | null; voice: "voicestudio" | "elevenlabs"; transcriber: "whisper-local" | "openai-whisper" };
  providers: Record<string, ProviderView>;
}

export function SettingsForm() {
  const [data, setData] = useState<SettingsData | null>(null);
  const load = useCallback(async () => setData(await api<SettingsData>("/api/settings")), []);
  useEffect(() => {
    let alive = true;
    api<SettingsData>("/api/settings")
      .then((d) => alive && setData(d))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Couldn't load settings."));
    return () => {
      alive = false;
    };
  }, []);

  async function choose(patch: Partial<SettingsData["choices"]>) {
    await api("/api/settings", { method: "PUT", json: { target: "choices", ...patch } });
    await load();
  }

  if (!data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const p = data.providers;
  const brain = data.choices.brain ?? (p.anthropic?.hasKey || p.anthropic?.fromEnvironment ? "anthropic" : p.openai?.hasKey ? "openai" : "anthropic");

  return (
    <div className="space-y-10">
      <Section title="AI brain" description="Writes scripts, plans visuals and powers the assistant. Connect one or both, then choose which to use.">
        <Choice
          value={brain}
          options={[
            { id: "anthropic", label: "Claude", hint: "Anthropic" },
            { id: "openai", label: "GPT", hint: "OpenAI" },
          ]}
          onChange={(v) => void choose({ brain: v as "anthropic" | "openai" })}
        />
        <ProviderCard id="anthropic" title="Claude (Anthropic)" view={p.anthropic!} onSaved={load} keyLabel="Anthropic API key" options={[{ key: "model", label: "Model", placeholder: "claude-opus-5-5" }]} />
        <ProviderCard
          id="openai"
          title="OpenAI"
          view={p.openai!}
          onSaved={load}
          keyLabel="OpenAI API key"
          hint="Also used for picture generation and (optionally) cloud transcription."
          options={[
            { key: "model", label: "Text model", placeholder: "gpt-6.2-astra" },
            { key: "imageModel", label: "Image model", placeholder: "gpt-image-2.5-flare" },
          ]}
        />
      </Section>

      <Section title="Bangla voice" description="Generates the narration. VoiceStudio runs on this computer; ElevenLabs is a cloud service.">
        <Choice
          value={data.choices.voice}
          options={[
            { id: "voicestudio", label: "VoiceStudio", hint: "On this computer" },
            { id: "elevenlabs", label: "ElevenLabs", hint: "Cloud" },
          ]}
          onChange={(v) => void choose({ voice: v as "voicestudio" | "elevenlabs" })}
        />
        {data.choices.voice === "voicestudio" ? (
          <ProviderCard
            id="voicestudio"
            title="VoiceStudio"
            view={p.voicestudio!}
            onSaved={load}
            keyLabel="API key (only for remote VoiceStudio)"
            optionalKey
            hint="Start the VoiceStudio app first. For natural Bangla, create a voice profile from a Bangla recording in VoiceStudio and choose it below."
            options={[{ key: "baseUrl", label: "Address", placeholder: "http://127.0.0.1:3900" }]}
            voicePicker="voicestudio"
            voiceOption="voice"
          />
        ) : (
          <ProviderCard
            id="elevenlabs"
            title="ElevenLabs"
            view={p.elevenlabs!}
            onSaved={load}
            keyLabel="ElevenLabs API key"
            hint="Bangla needs the eleven_v4 or eleven_v3 model."
            options={[{ key: "model", label: "Model", placeholder: "eleven_v4" }]}
            voicePicker="elevenlabs"
            voiceOption="voiceId"
          />
        )}
      </Section>

      <Section title="Transcription & subtitles" description="Whisper listens to the narration and creates timed Bangla subtitles.">
        <Choice
          value={data.choices.transcriber}
          options={[
            { id: "whisper-local", label: "Whisper", hint: "On this computer (free)" },
            { id: "openai-whisper", label: "OpenAI Whisper", hint: "Cloud, uses OpenAI key" },
          ]}
          onChange={(v) => void choose({ transcriber: v as "whisper-local" | "openai-whisper" })}
        />
        {data.choices.transcriber === "whisper-local" ? (
          <ProviderCard
            id="whisper"
            title="Local Whisper"
            view={p.whisper!}
            onSaved={load}
            noKey
            hint="Install once with: pip install -U openai-whisper. The 'medium' model gives good Bangla on a normal CPU (slower); 'large-v3' is best."
            options={[
              { key: "command", label: "Command", placeholder: "whisper" },
              { key: "model", label: "Model", placeholder: "medium" },
            ]}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Uses your OpenAI key (model whisper-1, which OpenAI plans to retire on 2027‑02‑26).</p>
        )}
      </Section>

      <p className="text-sm text-muted-foreground">
        Music: no music generator is connected — upload music files in the editor’s Media tab (choose “Music”) and the assistant can place them.
      </p>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Choice({ value, options, onChange }: { value: string; options: Array<{ id: string; label: string; hint: string }>; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={cn("rounded-lg border p-3 text-left transition-colors hover:bg-surface", value === o.id && "border-foreground/40 bg-surface")}
        >
          <span className="block text-sm font-medium">{o.label}</span>
          <span className="block text-xs text-muted-foreground">{o.hint}</span>
        </button>
      ))}
    </div>
  );
}

function ProviderCard(props: {
  id: string;
  title: string;
  view: ProviderView;
  onSaved: () => Promise<void>;
  keyLabel?: string;
  hint?: string;
  noKey?: boolean;
  optionalKey?: boolean;
  options: Array<{ key: string; label: string; placeholder: string }>;
  voicePicker?: "voicestudio" | "elevenlabs";
  voiceOption?: string;
}) {
  const { view } = props;
  const [key, setKey] = useState("");
  const [opts, setOpts] = useState<Record<string, string>>(() =>
    Object.fromEntries([...props.options.map((o) => o.key), props.voiceOption ?? ""].filter(Boolean).map((k) => [k, String(view.options[k] ?? "")])),
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [voices, setVoices] = useState<Array<{ id: string; name: string }> | null>(null);

  async function save(removeKey = false) {
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PUT",
        json: { target: props.id, apiKey: removeKey ? null : key.trim() ? key.trim() : undefined, options: Object.fromEntries(Object.entries(opts).map(([k, v]) => [k, v.trim() || null])) },
      });
      setKey("");
      toast.success(`${props.title} settings saved.`);
      await props.onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      if (key.trim()) await save();
      const r = await api<{ ok: boolean; message: string }>("/api/settings/test", { method: "POST", json: { provider: props.id } });
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      await props.onSaved();
    } finally {
      setTesting(false);
    }
  }

  async function loadVoices() {
    try {
      const r = await api<{ voices: Array<{ id: string; name: string }> }>(`/api/settings/voices?engine=${props.voicePicker}`);
      setVoices(r.voices);
      if (r.voices.length === 0) toast.message("No voices found. Create a voice profile in the service first.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load voices.");
    }
  }

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{props.title}</h3>
          {props.hint ? <p className="text-sm text-muted-foreground">{props.hint}</p> : null}
        </div>
        {view.lastTest ? (
          <span className={cn("flex shrink-0 items-center gap-1 text-xs", view.lastTest.ok ? "text-success" : "text-destructive")} title={view.lastTest.message}>
            {view.lastTest.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
            {view.lastTest.ok ? "Connected" : "Not working"}
          </span>
        ) : null}
      </div>
      {view.lastTest && !view.lastTest.ok ? <p className="rounded-md bg-destructive-soft p-2 text-sm">{view.lastTest.message}</p> : null}

      {!props.noKey ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${props.id}-key`}>{props.keyLabel}</Label>
          <div className="flex gap-2">
            <Input
              id={`${props.id}-key`}
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={view.fromEnvironment ? "Set by an environment variable" : view.hasKey ? `Saved (${view.keyHint})` : props.optionalKey ? "Not needed on this computer" : "Paste your key"}
            />
            {view.hasKey ? (
              <Button variant="ghost" onClick={() => void save(true)} disabled={saving}>
                Remove
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {props.options.map((o) => (
          <div key={o.key} className="space-y-1.5">
            <Label htmlFor={`${props.id}-${o.key}`}>{o.label}</Label>
            <Input id={`${props.id}-${o.key}`} value={opts[o.key] ?? ""} placeholder={o.placeholder} onChange={(e) => setOpts((s) => ({ ...s, [o.key]: e.target.value }))} />
          </div>
        ))}
        {props.voicePicker && props.voiceOption ? (
          <div className="space-y-1.5">
            <Label>Voice</Label>
            <div className="flex gap-2">
              {voices ? (
                <select
                  value={opts[props.voiceOption] ?? ""}
                  onChange={(e) => setOpts((s) => ({ ...s, [props.voiceOption!]: e.target.value }))}
                  className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Default</option>
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              ) : (
                <Input value={opts[props.voiceOption] ?? ""} placeholder="default" onChange={(e) => setOpts((s) => ({ ...s, [props.voiceOption!]: e.target.value }))} />
              )}
              <Button variant="outline" onClick={() => void loadVoices()}>
                List
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex gap-2">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null} Save
        </Button>
        <Button variant="outline" onClick={() => void test()} disabled={testing}>
          {testing ? <Loader2 className="animate-spin" /> : <PlugZap />} Test connection
        </Button>
      </div>
    </div>
  );
}
