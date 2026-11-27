"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, AudioLines, Captions, CheckCircle2, FolderOpen, ImagePlus, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { ASPECT_RATIOS, ASPECT_RATIO_LABELS, LANGUAGES, type AspectRatio } from "@studio/shared";
import { formatClock, parseSubtitles, type ParsedSubtitles } from "@studio/timeline";
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

const MAX_REFERENCES = 10;
const MAX_ASSET_FILES = 300;
const MAX_ASSET_BYTES = 500 * 1024 * 1024;

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;
const SUBTITLE_EXT = /\.(srt|vtt)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const ASSET_EXT = /\.(png|jpe?g|webp|gif|svg|mp3|wav|m4a|ogg|mp4|webm|mov|json)$/i;

type Step = "idle" | "creating" | "voice" | "subtitles" | "references" | "assets" | "timeline";

const formatSize = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const isAudio = (f: File) => AUDIO_EXT.test(f.name) || f.type.startsWith("audio/");
const isImage = (f: File) => IMAGE_EXT.test(f.name) || /^image\/(png|jpeg|webp)$/.test(f.type);

/** Read a subtitle file as text, whatever tool saved it (UTF-8 or UTF-16). */
async function readSubtitleText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

/** Length of an audio file, read by the browser. */
function audioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    const done = (v: number | null) => {
      resolve(v);
      URL.revokeObjectURL(url);
    };
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

interface AssetFile {
  file: File;
  /** Path inside the chosen folder, e.g. "characters/hero.png". */
  path: string;
}

export function CreateProjectForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [voice, setVoice] = useState<File | null>(null);
  const [voiceLength, setVoiceLength] = useState<number | null>(null);
  const [subtitles, setSubtitles] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedSubtitles | null>(null);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [references, setReferences] = useState<File[]>([]);
  const [assets, setAssets] = useState<{ folder: string; files: AssetFile[] } | null>(null);
  const [language, setLanguage] = useState("bn");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [style, setStyle] = useState<string>("2d-cartoon");
  const [step, setStep] = useState<Step>("idle");
  const [progress, setProgress] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const busy = step !== "idle";

  async function chooseVoice(file: File | null) {
    setVoice(file);
    setVoiceLength(null);
    setErrors((e) => ({ ...e, voice: "" }));
    if (!file) return;
    setVoiceLength(await audioDuration(file));
    setTitle((t) => t || file.name.replace(/\.[^.]+$/, "").replace(/^ElevenLabs[_-]/i, "").replace(/[_-]+/g, " "));
  }

  async function chooseSubtitles(file: File | null) {
    setSubtitles(file);
    setParsed(null);
    setSubtitleError(null);
    setErrors((e) => ({ ...e, subtitles: "" }));
    if (!file) return;
    try {
      setParsed(parseSubtitles(await readSubtitleText(file)));
    } catch (error) {
      setSubtitleError(error instanceof Error ? error.message : "This subtitle file couldn't be read.");
    }
  }

  function addReferences(files: File[]) {
    const images = files.filter(isImage);
    if (images.length < files.length) toast.message("Only pictures (PNG, JPG, WebP) can be reference images.");
    setReferences((current) => {
      if (current.length + images.length > MAX_REFERENCES) toast.message(`Up to ${MAX_REFERENCES} reference images — the rest were left out.`);
      return [...current, ...images].slice(0, MAX_REFERENCES);
    });
  }

  function chooseFolder(list: FileList | null) {
    if (!list?.length) return;
    const all = [...list];
    const folder = all[0]!.webkitRelativePath.split("/")[0] || "assets";
    const files = all
      .filter((f) => ASSET_EXT.test(f.name) && !f.name.startsWith("."))
      .map((f) => ({ file: f, path: f.webkitRelativePath.split("/").slice(1).join("/") || f.name }));
    const size = files.reduce((n, f) => n + f.file.size, 0);
    if (files.length === 0) return toast.error("That folder has no pictures, sounds or videos to use.");
    if (files.length > MAX_ASSET_FILES) return toast.error(`That folder has ${files.length} files — the limit is ${MAX_ASSET_FILES}.`);
    if (size > MAX_ASSET_BYTES) return toast.error("That folder is larger than 500 MB.");
    setAssets({ folder, files });
  }

  /** Every dropped or picked file goes where it belongs, whichever box it landed on. */
  function routeFiles(files: File[]) {
    const audio = files.find(isAudio);
    const subs = files.find((f) => SUBTITLE_EXT.test(f.name));
    const images = files.filter(isImage);
    if (audio) void chooseVoice(audio);
    if (subs) void chooseSubtitles(subs);
    if (images.length) addReferences(images);
    if (!audio && !subs && !images.length) toast.error("Use an audio file (MP3/WAV/M4A), a subtitle file (.srt/.vtt) or pictures.");
  }

  // Never let a file dropped next to a box open in the browser and replace the page.
  useEffect(() => {
    const stop = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);

  const lastEnd = parsed?.cues.at(-1)?.end ?? null;
  const mismatch =
    lastEnd && voiceLength && lastEnd > voiceLength + 0.5
      ? `The subtitles run until ${formatClock(lastEnd)}, but the voiceover is ${formatClock(voiceLength)} long. Are they from the same recording?`
      : null;
  const emotions = useMemo(() => (parsed ? [...new Set(parsed.emotionHints.map((h) => h.tag))].slice(0, 8) : []), [parsed]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Give your video a name.";
    if (!voice) next.voice = "Add the voiceover (MP3, WAV or M4A).";
    if (!subtitles) next.subtitles = "Add the subtitle file (.srt or .vtt).";
    else if (subtitleError) next.subtitles = subtitleError;
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    let projectId: string | null = null;
    try {
      setStep("creating");
      const { project } = await api<{ project: Project }>("/api/projects", {
        method: "POST",
        json: { project: { title: title.trim(), language, aspectRatio, style } },
      });
      projectId = project.id;
      const upload = (kind: string, file: File, name: string) =>
        api(`/api/projects/${projectId}/input?kind=${kind}&name=${encodeURIComponent(name)}`, {
          method: "POST",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });

      setStep("voice");
      await upload("voice", voice!, voice!.name);
      setStep("subtitles");
      await upload("subtitles", subtitles!, subtitles!.name);
      if (references.length) {
        setStep("references");
        for (const [i, file] of references.entries()) {
          setProgress(`${i + 1} of ${references.length}`);
          await upload("reference", file, file.name);
        }
      }
      if (assets) {
        setStep("assets");
        for (const [i, a] of assets.files.entries()) {
          setProgress(`${i + 1} of ${assets.files.length}`);
          await upload("asset", a.file, a.path);
        }
      }
      setProgress("");
      setStep("timeline");
      const result = await api<{ warnings: string[] }>(`/api/projects/${projectId}/input?apply=1`, { method: "POST" });
      for (const w of result.warnings) toast.warning(w, { duration: 12000 });
      router.push(`/projects/${projectId}`);
    } catch (error) {
      // Don't leave a half-made project behind.
      if (projectId) await api(`/api/projects/${projectId}`, { method: "DELETE" }).catch(() => {});
      if (error instanceof ApiError) setErrors(Object.fromEntries(Object.entries(error.fields).map(([k, v]) => [k.replace(/^project\./, ""), v])));
      toast.error(error instanceof Error ? error.message : "The project could not be created.");
      setStep("idle");
      setProgress("");
    }
  }

  const stepLabel: Record<Step, string> = {
    idle: "",
    creating: "Creating the project…",
    voice: "Uploading the voiceover…",
    subtitles: "Reading the subtitles…",
    references: `Uploading reference images ${progress}…`,
    assets: `Uploading assets ${progress}…`,
    timeline: "Putting the voice on the timeline…",
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-8"
      noValidate
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length || busy) return;
        e.preventDefault();
        routeFiles([...e.dataTransfer.files]);
      }}
    >
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
          These two files are the heart of the video. Claude reads the story, scenes and emotions from the subtitles and times everything to your voice — the
          voice itself is never changed. You can drop both files anywhere on this page.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FileDrop
            label="Voiceover"
            hint="MP3, WAV or M4A"
            accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
            icon={<AudioLines className="size-5" />}
            tone="sky"
            file={voice}
            detail={voice ? `${voiceLength ? `${formatClock(voiceLength)} · ` : ""}${formatSize(voice.size)}` : undefined}
            onFiles={routeFiles}
            onClear={() => void chooseVoice(null)}
            error={errors.voice}
            disabled={busy}
          />
          <FileDrop
            label="Subtitles"
            hint=".srt or .vtt from the same recording"
            accept=".srt,.vtt,application/x-subrip,text/vtt"
            icon={<Captions className="size-5" />}
            tone="amber"
            file={subtitles}
            detail={parsed ? `${parsed.cues.length} lines · ${formatClock(parsed.cues[0]!.start)}–${formatClock(lastEnd!)}` : subtitles ? formatSize(subtitles.size) : undefined}
            onFiles={routeFiles}
            onClear={() => void chooseSubtitles(null)}
            error={errors.subtitles || subtitleError || undefined}
            disabled={busy}
          />
        </div>
        {emotions.length ? (
          <p className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted-foreground">
            Emotions found in the subtitles:
            {emotions.map((t) => (
              <span key={t} className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-200 capitalize">
                {t}
              </span>
            ))}
          </p>
        ) : null}
        {mismatch ? (
          <p className="flex gap-1.5 rounded-md bg-warning-soft p-2 text-sm text-warning">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> {mismatch}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 flex items-center gap-2 text-sm font-medium">
          Reference images or assets <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-slate-300">Optional</span>
        </legend>
        <p className="text-sm text-muted-foreground">
          Show Claude how your characters or places should look — up to {MAX_REFERENCES} pictures, ideally from different angles — or attach a folder of ready-made
          assets (pictures, sounds, video) to use in the scenes.
        </p>
        <References files={references} onAdd={addReferences} onRemove={(i) => setReferences((r) => r.filter((_, n) => n !== i))} disabled={busy} />
        <FolderPicker assets={assets} onChoose={chooseFolder} onClear={() => setAssets(null)} disabled={busy} />
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
              className={cn("flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-surface", aspectRatio === r && "border-brand bg-brand-soft/40")}
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
          Animation style <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-slate-300">Optional</span>
        </legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStyle(s.id)}
              aria-pressed={style === s.id}
              className={cn("rounded-lg border p-2.5 text-left transition-colors hover:bg-surface", style === s.id && "border-brand bg-brand-soft/60 ring-1 ring-brand/50")}
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

      <Button type="submit" size="lg" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : null} {busy ? stepLabel[step] : "Create video"}
      </Button>
    </form>
  );
}

const TONES = {
  sky: { idle: "border-sky-500/30 bg-sky-500/5 hover:bg-sky-500/10", icon: "bg-sky-500/15 text-sky-300", done: "border-sky-500/40 bg-sky-500/10" },
  amber: { idle: "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10", icon: "bg-amber-500/15 text-amber-300", done: "border-amber-500/40 bg-amber-500/10" },
};

function FileDrop(props: {
  label: string;
  hint: string;
  accept: string;
  icon: React.ReactNode;
  tone: keyof typeof TONES;
  file: File | null;
  detail?: string;
  onFiles: (files: File[]) => void;
  onClear: () => void;
  error?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const tone = TONES[props.tone];
  const ok = Boolean(props.file) && !props.error;
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !props.disabled && ref.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && ref.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          if (!props.disabled && e.dataTransfer.files.length) props.onFiles([...e.dataTransfer.files]);
        }}
        className={cn(
          "flex min-h-28 cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed p-4 transition-colors",
          ok ? cn("border-solid", tone.done) : tone.idle,
          over && "ring-2 ring-brand/60",
          props.error && "border-destructive",
        )}
      >
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone.icon)}>
          {ok ? <CheckCircle2 className="size-5" /> : props.error ? <AlertCircle className="size-5 text-destructive" /> : props.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {props.label} <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] font-medium text-slate-300 ring-1 ring-white/10">Required</span>
          </p>
          {props.file ? (
            <>
              <p className="truncate text-sm" title={props.file.name}>
                {props.file.name}
              </p>
              {props.detail ? <p className="text-xs text-muted-foreground">{props.detail}</p> : null}
            </>
          ) : (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <Upload className="size-3.5 shrink-0" /> Drop the file or click — {props.hint}
            </p>
          )}
        </div>
        {props.file && !props.disabled ? (
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              props.onClear();
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
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) props.onFiles(files);
          }}
        />
      </div>
      {props.error ? <p className="mt-1 text-sm text-destructive">{props.error}</p> : null}
    </div>
  );
}

function References({ files, onAdd, onRemove, disabled }: { files: File[]; onAdd: (f: File[]) => void; onRemove: (i: number) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <div key={`${f.name}-${i}`} className="group relative size-20 overflow-hidden rounded-lg ring-1 ring-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urls[i]} alt={f.name} className="size-full object-cover" />
          {!disabled ? (
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="absolute top-1 right-1 rounded bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
              aria-label={`Remove ${f.name}`}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      ))}
      {files.length < MAX_REFERENCES ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => ref.current?.click()}
          className="flex size-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-brand/40 text-xs text-muted-foreground hover:bg-brand-soft/40 hover:text-foreground"
        >
          <ImagePlus className="size-5 text-brand" />
          {files.length ? `${files.length}/${MAX_REFERENCES}` : "Add images"}
        </button>
      ) : null}
      <input
        ref={ref}
        type="file"
        hidden
        multiple
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const list = [...(e.target.files ?? [])];
          e.target.value = "";
          if (list.length) onAdd(list);
        }}
      />
    </div>
  );
}

function FolderPicker({
  assets,
  onChoose,
  onClear,
  disabled,
}: {
  assets: { folder: string; files: AssetFile[] } | null;
  onChoose: (list: FileList | null) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // `webkitdirectory` isn't in React's types; set it on the element.
  useEffect(() => {
    ref.current?.setAttribute("webkitdirectory", "");
    ref.current?.setAttribute("directory", "");
  }, []);
  const count = (re: RegExp) => assets?.files.filter((a) => re.test(a.path)).length ?? 0;
  const summary = [
    [count(/\.(png|jpe?g|webp|gif|svg)$/i), "pictures"],
    [count(/\.(mp3|wav|m4a|ogg)$/i), "sounds"],
    [count(/\.(mp4|webm|mov)$/i), "videos"],
  ]
    .filter(([n]) => Number(n) > 0)
    .map(([n, what]) => `${n} ${what}`)
    .join(" · ");
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
        <FolderOpen className="size-4" />
      </span>
      {assets ? (
        <div className="min-w-0 flex-1 text-sm">
          <p className="truncate font-medium">{assets.folder}/</p>
          <p className="text-xs text-muted-foreground">{summary}</p>
        </div>
      ) : (
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">Attach a folder of assets (characters, backgrounds, sounds…)</p>
      )}
      {assets ? (
        <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={disabled}>
          Remove
        </Button>
      ) : null}
      <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()} disabled={disabled}>
        <FolderOpen /> {assets ? "Change" : "Attach folder"}
      </Button>
      <input
        ref={ref}
        type="file"
        hidden
        multiple
        onChange={(e) => {
          onChoose(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
