"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Captions,
  CheckCircle2,
  ChevronDown,
  ImagePlus,
  Images,
  Loader2,
  Mic,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { newSceneId, sceneRanges, formatClock, type Scene, type Script } from "@studio/timeline";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { isBusy, mediaUrl, useEditorContext } from "../context";
import { useEditor } from "../store";

const WPM: Record<string, number> = { bn: 110, en: 140 };

export function ScriptPanel() {
  const { script: stored, saveScript, jobs, startJob, project } = useEditorContext();
  const [local, setLocal] = useState<Script>(stored.script);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Take outside changes (AI, jobs) when we have no unsaved edits.
  useEffect(() => {
    if (!pending.current) setLocal(stored.script);
  }, [stored]);

  function edit(next: Script) {
    setLocal(next);
    pending.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await saveScript(next);
      pending.current = false;
    }, 900);
  }
  const editScene = (id: string, patch: Partial<Scene>) => edit({ ...local, scenes: local.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const writing = isBusy(jobs, "story.write");
  const voicing = isBusy(jobs, "voice.generate");
  const subtitling = isBusy(jobs, "subtitles.generate");
  const planning = isBusy(jobs, "storyboard.plan", "images.generate");

  if (writing) return <BusyCard title="The Story Agent is writing your script" job={writing} />;
  if (local.scenes.length === 0) return <EmptyScript topic={project.topic} onManual={() => edit({ ...local, scenes: [blankScene(1)] })} />;

  const totalWords = local.scenes.reduce((n, s) => n + words(s.narration), 0);
  const estMinutes = totalWords / (WPM[project.language] ?? 120);
  const voiced = local.scenes.filter((s) => s.narrationAssetId).length;

  return (
    <div className="space-y-3 p-3">
      <div className="space-y-1">
        <input
          value={local.title}
          onChange={(e) => edit({ ...local, title: e.target.value })}
          placeholder="Script title"
          className="w-full rounded-md bg-transparent px-1 font-[family-name:var(--font-bangla)] text-base font-semibold hover:bg-surface focus:bg-surface focus:outline-none"
        />
        {local.logline ? <p className="px-1 font-[family-name:var(--font-bangla)] text-sm text-muted-foreground">{local.logline}</p> : null}
        <p className="px-1 text-xs text-muted-foreground">
          {local.scenes.length} scenes · {totalWords} words · about {Math.max(1, Math.round(estMinutes))} min · {voiced}/{local.scenes.length} voiced
        </p>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <Button size="sm" variant="outline" disabled={Boolean(voicing)} onClick={() => void startJob("voice.generate", { sceneIds: [] })}>
          {voicing ? <Loader2 className="animate-spin" /> : <Mic />} Voice all
        </Button>
        <Button size="sm" variant="outline" disabled={Boolean(subtitling) || voiced === 0} onClick={() => void startJob("subtitles.generate", {})}>
          {subtitling ? <Loader2 className="animate-spin" /> : <Captions />} Subtitles
        </Button>
        <Button size="sm" variant="outline" disabled={Boolean(planning)} onClick={() => void startJob("storyboard.plan", { sceneIds: [], generateImages: true })}>
          {planning ? <Loader2 className="animate-spin" /> : <Images />} Visuals
        </Button>
      </div>
      {voicing ? <BusyLine job={voicing} /> : null}
      {subtitling ? <BusyLine job={subtitling} /> : null}
      {planning ? <BusyLine job={planning} /> : null}

      <button
        onClick={() => edit({ ...local, approvedAt: local.approvedAt ? null : new Date().toISOString() })}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm",
          local.approvedAt ? "border-success/40 bg-success-soft text-success" : "hover:bg-surface",
        )}
      >
        <CheckCircle2 className="size-4" /> {local.approvedAt ? "Script approved" : "Approve the script when you’re happy with it"}
      </button>

      <ol className="space-y-3">
        {local.scenes.map((scene, i) => (
          <SceneCard
            key={scene.id}
            scene={scene}
            index={i}
            count={local.scenes.length}
            onChange={(p) => editScene(scene.id, p)}
            onMove={(dir) => {
              const scenes = [...local.scenes];
              const [s] = scenes.splice(i, 1);
              scenes.splice(i + dir, 0, s!);
              edit({ ...local, scenes });
            }}
            onDelete={() => edit({ ...local, scenes: local.scenes.filter((s) => s.id !== scene.id) })}
          />
        ))}
      </ol>
      <Button variant="ghost" size="sm" className="w-full" onClick={() => edit({ ...local, scenes: [...local.scenes, blankScene(local.scenes.length + 1)] })}>
        <Plus /> Add scene
      </Button>
    </div>
  );
}

function SceneCard({ scene, index, count, onChange, onMove, onDelete }: {
  scene: Scene;
  index: number;
  count: number;
  onChange: (p: Partial<Scene>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const { jobs, startJob, upload, mediaById, store, playhead, project } = useEditorContext();
  const timeline = useEditor(store, (s) => s.timeline);
  const range = sceneRanges(timeline).get(scene.id);
  const [showVisual, setShowVisual] = useState(false);
  const voiceRef = useRef<HTMLInputElement>(null);
  const voiceAsset = scene.narrationAssetId ? mediaById.get(scene.narrationAssetId) : undefined;
  const sceneVoicing = jobs.some((j) => j.type === "voice.generate" && (j.status === "pending" || j.status === "running") && (j.input.sceneIds as string[] | undefined)?.includes(scene.id));
  const est = words(scene.narration) / ((WPM[project.language] ?? 120) / 60);

  return (
    <li className="rounded-lg border bg-card">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <button
          className="flex size-6 shrink-0 items-center justify-center rounded bg-secondary text-xs font-semibold hover:bg-brand-soft"
          onClick={() => range && playhead.seek(range.start)}
          title={range ? `Jump to ${formatClock(range.start)}` : "Not on the timeline yet"}
        >
          {index + 1}
        </button>
        <input
          value={scene.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="min-w-0 flex-1 rounded bg-transparent px-1 font-[family-name:var(--font-bangla)] text-sm font-medium hover:bg-surface focus:bg-surface focus:outline-none"
          aria-label="Scene title"
        />
        <button className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up">
          <ArrowUp className="size-3.5" />
        </button>
        <button className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move down">
          <ArrowDown className="size-3.5" />
        </button>
        <button className="rounded p-1 text-muted-foreground hover:bg-destructive-soft hover:text-destructive" onClick={onDelete} aria-label="Delete scene">
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <div className="space-y-2 p-2">
        <Textarea
          value={scene.narration}
          onChange={(e) => onChange({ narration: e.target.value })}
          placeholder="এখানে এই দৃশ্যের ধারাভাষ্য লিখুন…"
          className="min-h-24 font-[family-name:var(--font-bangla)] text-[15px] leading-7"
          lang={project.language}
        />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{words(scene.narration)} words · ~{Math.round(est)} s</span>
          {range ? <span>On timeline {formatClock(range.start)}–{formatClock(range.end)}</span> : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="xs" variant="outline" disabled={sceneVoicing || !scene.narration.trim()} onClick={() => void startJob("voice.generate", { sceneIds: [scene.id] })}>
            {sceneVoicing ? <Loader2 className="animate-spin" /> : <Mic />} {scene.narrationAssetId ? "Regenerate voice" : "Generate voice"}
          </Button>
          <Button size="xs" variant="ghost" onClick={() => voiceRef.current?.click()}>
            <Upload /> Upload recording
          </Button>
          <input
            ref={voiceRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload([f], { role: "narration", sceneId: scene.id });
            }}
          />
        </div>
        {voiceAsset?.status === "ready" ? <audio src={mediaUrl(voiceAsset.id)} controls preload="none" className="h-8 w-full" /> : null}
        {voiceAsset?.status === "processing" ? <p className="text-xs text-muted-foreground">Preparing the recording…</p> : null}

        <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowVisual((v) => !v)}>
          <ChevronDown className={cn("size-3.5 transition-transform", showVisual && "rotate-180")} />
          Visuals {scene.shots.length ? `(${scene.shots.filter((s) => s.assetId).length}/${scene.shots.length} pictures)` : ""}
        </button>
        {showVisual ? <SceneVisuals scene={scene} onChange={onChange} /> : null}
      </div>
    </li>
  );
}

function SceneVisuals({ scene, onChange }: { scene: Scene; onChange: (p: Partial<Scene>) => void }) {
  const { jobs, startJob, upload, mediaById } = useEditorContext();
  const fileRefs = useRef(new Map<string, HTMLInputElement>());
  const planning = jobs.some((j) => (j.type === "storyboard.plan" || j.type === "images.generate") && (j.status === "pending" || j.status === "running"));
  return (
    <div className="space-y-2 rounded-md bg-surface p-2">
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">Visual direction</span>
        <Textarea value={scene.visualDirection} onChange={(e) => onChange({ visualDirection: e.target.value })} rows={2} className="bg-background text-sm" />
      </label>
      <Button size="xs" variant="outline" disabled={planning} onClick={() => void startJob("storyboard.plan", { sceneIds: [scene.id], generateImages: true })}>
        <Wand2 /> {scene.shots.length ? "Re-plan shots" : "Plan shots with AI"}
      </Button>
      {scene.shots.map((shot, i) => {
        const asset = shot.assetId ? mediaById.get(shot.assetId) : undefined;
        return (
          <div key={shot.id} className="flex gap-2 rounded-md border bg-background p-1.5">
            <div className="flex aspect-video w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-surface">
              {asset?.thumbnailKey ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(asset.id, "thumb")} alt="" className="size-full object-cover" />
              ) : (
                <span className="text-[10px] text-muted-foreground">Shot {i + 1}</span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="line-clamp-2 text-xs" title={shot.imagePrompt}>
                {shot.description}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {shot.duration.toFixed(1)} s · {shot.motion.replace("_", " ")}
              </p>
              <div className="flex gap-1">
                <Button size="xs" variant="ghost" disabled={planning} onClick={() => void startJob("images.generate", { shotIds: [shot.id] })}>
                  <Sparkles /> {asset ? "Redo" : "Generate"}
                </Button>
                <Button size="xs" variant="ghost" onClick={() => fileRefs.current.get(shot.id)?.click()}>
                  <ImagePlus /> Upload
                </Button>
                <input
                  ref={(el) => {
                    if (el) fileRefs.current.set(shot.id, el);
                  }}
                  type="file"
                  accept="image/*,video/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void upload([f], { role: "visual", sceneId: scene.id, shotId: shot.id });
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyScript({ topic, onManual }: { topic: string; onManual: () => void }) {
  const { startJob } = useEditorContext();
  const [text, setText] = useState(topic);
  const [minutes, setMinutes] = useState(3);
  const [instructions, setInstructions] = useState("");
  return (
    <div className="space-y-4 p-4">
      <div>
        <h2 className="text-base font-semibold">Develop your story</h2>
        <p className="text-sm text-muted-foreground">The Story Agent researches the topic and writes a Bangla script divided into scenes, with narration and visual direction.</p>
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="বিষয়, গল্পের ধারণা, গবেষণার নোট বা খসড়া স্ক্রিপ্ট…" className="font-[family-name:var(--font-bangla)] text-[15px]" />
      <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} placeholder="Optional: tone, audience, things to include or avoid" className="text-sm" />
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Length</span>
        <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="h-8 rounded-md border bg-background px-2 text-sm">
          {[1, 3, 5, 10, 15].map((m) => (
            <option key={m} value={m}>
              ~{m} min
            </option>
          ))}
        </select>
      </div>
      <Button className="w-full" disabled={!text.trim()} onClick={() => void startJob("story.write", { topic: text, instructions, targetMinutes: minutes })}>
        <Sparkles /> Write the script with AI
      </Button>
      <Button variant="ghost" className="w-full" onClick={onManual}>
        I’ll write it myself
      </Button>
    </div>
  );
}

function BusyCard({ title, job }: { title: string; job: { progress: number; progressMessage: string; status: string } }) {
  return (
    <div className="space-y-3 p-6 text-center">
      <Loader2 className="mx-auto size-6 animate-spin text-brand" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{job.status === "pending" ? "Waiting for the background worker…" : job.progressMessage || "Working…"}</p>
      <Progress value={job.progress * 100} className="h-1.5" />
      <p className="text-xs text-muted-foreground">This usually takes a minute or two.</p>
    </div>
  );
}

function BusyLine({ job }: { job: { progress: number; progressMessage: string; status: string } }) {
  return (
    <div className="space-y-1 rounded-md bg-brand-soft/60 p-2">
      <p className="truncate text-xs">{job.status === "pending" ? "Waiting to start…" : job.progressMessage || "Working…"}</p>
      <Progress value={job.progress * 100} className="h-1" />
    </div>
  );
}

function blankScene(n: number): Scene {
  return { id: newSceneId(), title: `দৃশ্য ${n}`, narration: "", visualDirection: "", mood: "", estimatedDuration: 20, narrationAssetId: null, shots: [] };
}

function words(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
