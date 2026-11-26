"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ASPECT_RATIOS, LANGUAGES, VISUAL_STYLES, VISUAL_STYLE_LABELS, type AspectRatio, type VisualStyle } from "@studio/shared";
import type { Project } from "@studio/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const SHAPES: Record<AspectRatio, { name: string; hint: string; box: string }> = {
  "16:9": { name: "Widescreen", hint: "YouTube, TV", box: "w-9 h-5" },
  "9:16": { name: "Vertical", hint: "Shorts, Reels", box: "w-3.5 h-6" },
  "1:1": { name: "Square", hint: "Social feeds", box: "w-5 h-5" },
};

export function CreateDocumentaryForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [language, setLanguage] = useState("bn");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [visualStyle, setVisualStyle] = useState<VisualStyle>("documentary");
  const [minutes, setMinutes] = useState("3");
  const [writeScript, setWriteScript] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setErrors({ title: "Give your documentary a title." });
    if (writeScript && !topic.trim()) return setErrors({ topic: "Describe the topic so the AI can write the script." });
    setBusy(true);
    setErrors({});
    try {
      const { project } = await api<{ project: Project }>("/api/projects", {
        method: "POST",
        json: {
          project: { title, topic, language, aspectRatio, visualStyle },
          writeScript: writeScript ? { targetMinutes: Number(minutes) } : null,
        },
      });
      router.push(`/projects/${project.id}`);
    } catch (error) {
      if (error instanceof ApiError) setErrors(Object.fromEntries(Object.entries(error.fields).map(([k, v]) => [k.replace(/^project\./, ""), v])));
      toast.error(error instanceof Error ? error.message : "The project could not be created.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="যেমন: মুক্তিযুদ্ধের নয় মাস" className="h-11 text-base" autoFocus aria-invalid={Boolean(errors.title)} />
        {errors.title ? <p className="text-sm text-destructive">{errors.title}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="topic">What is it about?</Label>
        <Textarea
          id="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={5}
          className="min-h-32 text-base"
          placeholder="A topic, a rough story, research notes or an existing script. যেমন: ১৯৭১ সালের মুক্তিযুদ্ধ — সাধারণ মানুষের চোখে।"
          aria-invalid={Boolean(errors.topic)}
        />
        {errors.topic ? <p className="text-sm text-destructive">{errors.topic}</p> : null}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Language</Label>
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
        <div className="space-y-2">
          <Label>Visual style</Label>
          <Select value={visualStyle} onValueChange={(v) => setVisualStyle(v as VisualStyle)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VISUAL_STYLES.map((s) => (
                <SelectItem key={s} value={s}>
                  {VISUAL_STYLE_LABELS[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Video shape</legend>
        <div className="grid grid-cols-3 gap-3">
          {ASPECT_RATIOS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setAspectRatio(r)}
              aria-pressed={aspectRatio === r}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-surface",
                aspectRatio === r && "border-foreground/40 bg-surface",
              )}
            >
              <span className="flex size-7 items-center justify-center">
                <span className={cn("rounded-[3px] border-2 border-foreground/70", SHAPES[r].box)} />
              </span>
              <span>
                <span className="block text-sm font-medium">{SHAPES[r].name}</span>
                <span className="block text-xs text-muted-foreground">{SHAPES[r].hint}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="rounded-xl border bg-surface p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={writeScript} onChange={(e) => setWriteScript(e.target.checked)} className="mt-1 size-4 accent-[var(--brand)]" />
          <span className="flex-1">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="size-4 text-brand" aria-hidden /> Let the AI write the first script
            </span>
            <span className="mt-0.5 block text-sm text-muted-foreground">Uses the AI brain you connected in Settings (Claude or GPT). You can edit everything afterwards.</span>
          </span>
        </label>
        {writeScript ? (
          <div className="mt-3 flex items-center gap-3 pl-7">
            <Label className="text-sm font-normal text-muted-foreground">Length</Label>
            <Select value={minutes} onValueChange={setMinutes}>
              <SelectTrigger className="w-44" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["1", "3", "5", "10", "15"].map((m) => (
                  <SelectItem key={m} value={m}>
                    About {m} minute{m === "1" ? "" : "s"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <Button type="submit" size="lg" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : null} {busy ? "Opening the editor…" : "Create and open editor"}
      </Button>
    </form>
  );
}
