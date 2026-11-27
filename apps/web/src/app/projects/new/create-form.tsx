"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, Captions, CheckCircle2, Loader2, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { ASPECT_RATIOS, ASPECT_RATIO_LABELS, LANGUAGES, type AspectRatio } from "@studio/shared";
import type { Project } from "@studio/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const SHAPE_BOX: Record<AspectRatio, string> = {
  "16:9": "w-9 h-5",
  "9:16": "w-3.5 h-6",
  "4:5": "w-4 h-5",
  "1:1": "w-5 h-5",
};

/** Optional look for the cartoon. Claude uses the default when nothing is picked. */
const STYLES = [
  { id: "2d-cartoon", name: "2D cartoon", hint: "Default · bold shapes, soft shading", swatch: "from-amber-300 to-orange-400" },
  { id: "storybook", name: "Storybook", hint: "Painted, warm, gentle", swatch: "from-rose-200 to-amber-200" },
  { id: "anime", name: "Anime-inspired", hint: "Clean lines, dramatic light", swatch: "from-sky-300 to-indigo-400" },
  { id: "paper-cutout", name: "Paper cut-out", hint: "Layered paper, textured", swatch: "from-lime-200 to-emerald-300" },
] as const;

type Step = "idle" | "creating" | "voice" | "subtitles" | "timeline";
const STEP_LABEL: Record<Step, string> = {
  idle: "",
  creating: "Creating the project…",
  voice: "Uploading the voiceover…",
  subtitles: "Reading the subtitles…",
  timeline: "Putting them on the timeline…",
};

const formatSize = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function CreateProjectForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [voice, setVoice] = useState<File | null>(null);
  const [subtitles, setSubtitles] = useState<File | null>(null);
  const [language, setLanguage] = useState("bn");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [style, setStyle] = useState<string>("2d-cartoon");
  const [step, setStep] = useState<Step>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const busy = step !== "idle";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Give your video a name.";
    if (!voice) next.voice = "Add the voiceover (MP3, WAV or M4A).";
    if (!subtitles) next.subtitles = "Add the subtitle file (SRT or VTT).";
    setErrors(next);
    if (Object.keys(next).length) return;

    let projectId: string | null = null;
    try {
      setStep("creating");
      const { project } = await api<{ project: Project }>("/api/projects", {
        method: "POST",
        json: { project: { title: title.trim(), language, aspectRatio, style } },
      });
      projectId = project.id;
      setStep("voice");
      await api(`/api/projects/${projectId}/input?kind=voice&name=${encodeURIComponent(voice!.name)}`, {
        method: "POST",
        body: voice,
        headers: { "Content-Type": voice!.type || "application/octet-stream" },
      });
      setStep("subtitles");
      await api(`/api/projects/${projectId}/input?kind=subtitles&name=${encodeURIComponent(subtitles!.name)}`, {
        method: "POST",
        body: subtitles,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
      setStep("timeline");
      const result = await api<{ warnings: string[]; cues: number }>(`/api/projects/${projectId}/input?apply=1`, { method: "POST" });
      for (const w of result.warnings) toast.warning(w, { duration: 12000 });
      router.push(`/projects/${projectId}`);
    } catch (error) {
      // Don't leave a half-made project behind.
      if (projectId) await api(`/api/projects/${projectId}`, { method: "DELETE" }).catch(() => {});
      if (error instanceof ApiError) setErrors(Object.fromEntries(Object.entries(error.fields).map(([k, v]) => [k.replace(/^project\./, ""), v])));
      toast.error(error instanceof Error ? error.message : "The project could not be created.");
      setStep("idle");
    }
  }

  async function startSample() {
    setStep("creating");
    try {
      const { project } = await api<{ project: Project }>("/api/projects", {
        method: "POST",
        json: { project: { title: "Sample cartoon", language, aspectRatio }, sample: true },
      });
      router.push(`/projects/${project.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The sample could not be created.");
      setStep("idle");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      <div className="space-y-2">
        <Label htmlFor="title">Name</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="যেমন: মধ্যরাতের ট্রেন"
          className="h-11 text-base"
          autoFocus
          aria-invalid={Boolean(errors.title)}
        />
        {errors.title ? <p className="text-sm text-destructive">{errors.title}</p> : null}
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Your voiceover and subtitles</legend>
        <p className="mb-3 text-sm text-muted-foreground">
          These two files are the heart of the video. Claude animates the story from the subtitles, timed exactly to your voice — the voice itself is never changed.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FileDrop
            label="Voiceover"
            hint="MP3, WAV or M4A"
            accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
            icon={<AudioLines className="size-5" />}
            tone="sky"
            file={voice}
            onFile={setVoice}
            error={errors.voice}
            disabled={busy}
          />
          <FileDrop
            label="Subtitles"
            hint="SRT or VTT, matching the voiceover"
            accept=".srt,.vtt"
            icon={<Captions className="size-5" />}
            tone="amber"
            file={subtitles}
            onFile={setSubtitles}
            error={errors.subtitles}
            disabled={busy}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Video shape you’ll edit in</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ASPECT_RATIOS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setAspectRatio(r)}
              aria-pressed={aspectRatio === r}
              className={cn("flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-surface", aspectRatio === r && "border-foreground/40 bg-surface")}
            >
              <span className="flex size-7 items-center justify-center">
                <span className={cn("rounded-[3px] border-2 border-foreground/70", SHAPE_BOX[r])} />
              </span>
              <span>
                <span className="block text-sm font-medium">{r}</span>
                <span className="block text-xs text-muted-foreground">{ASPECT_RATIO_LABELS[r].hint}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">You can switch shapes any time and export several at once.</p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 flex items-center gap-2 text-sm font-medium">
          Animation style <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Optional</span>
        </legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStyle(s.id)}
              aria-pressed={style === s.id}
              className={cn("rounded-lg border p-2.5 text-left transition-colors hover:bg-surface", style === s.id && "border-violet-400 bg-violet-50 ring-1 ring-violet-300")}
            >
              <span className={cn("mb-2 block h-10 rounded-md bg-gradient-to-br", s.swatch)} />
              <span className="block text-sm font-medium">{s.name}</span>
              <span className="block text-xs text-muted-foreground">{s.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2 sm:max-w-xs">
        <Label>Captions language</Label>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.code} value={l.code}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null} {busy ? STEP_LABEL[step] : "Create video"}
        </Button>
        <span className="text-sm text-muted-foreground">
          No files yet?{" "}
          <button type="button" className="inline-flex items-center gap-1 font-medium text-violet-700 hover:underline disabled:opacity-50" onClick={() => void startSample()} disabled={busy}>
            <Sparkles className="size-3.5" /> Try the sample cartoon
          </button>
        </span>
      </div>
    </form>
  );
}

const TONES = {
  sky: { idle: "border-sky-200 bg-sky-50/60 hover:bg-sky-50", icon: "bg-sky-100 text-sky-700", done: "border-sky-300 bg-sky-50" },
  amber: { idle: "border-amber-200 bg-amber-50/60 hover:bg-amber-50", icon: "bg-amber-100 text-amber-700", done: "border-amber-300 bg-amber-50" },
};

function FileDrop(props: {
  label: string;
  hint: string;
  accept: string;
  icon: React.ReactNode;
  tone: keyof typeof TONES;
  file: File | null;
  onFile: (f: File | null) => void;
  error?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const tone = TONES[props.tone];
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !props.disabled && ref.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && ref.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f && !props.disabled) props.onFile(f);
        }}
        className={cn(
          "flex min-h-28 cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed p-4 transition-colors",
          props.file ? cn("border-solid", tone.done) : tone.idle,
          over && "ring-2 ring-violet-300",
          props.error && "border-destructive",
        )}
      >
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone.icon)}>{props.file ? <CheckCircle2 className="size-5" /> : props.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {props.label} <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200">Required</span>
          </p>
          {props.file ? (
            <p className="truncate text-sm" title={props.file.name}>
              {props.file.name} <span className="text-muted-foreground">· {formatSize(props.file.size)}</span>
            </p>
          ) : (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <Upload className="size-3.5" /> Drop the file or click — {props.hint}
            </p>
          )}
        </div>
        {props.file && !props.disabled ? (
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-white"
            onClick={(e) => {
              e.stopPropagation();
              props.onFile(null);
            }}
            aria-label={`Remove ${props.label.toLowerCase()}`}
          >
            <X className="size-4" />
          </button>
        ) : null}
        <input
          ref={ref}
          type="file"
          hidden
          accept={props.accept}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) props.onFile(f);
          }}
        />
      </div>
      {props.error ? <p className="mt-1 text-sm text-destructive">{props.error}</p> : null}
    </div>
  );
}
