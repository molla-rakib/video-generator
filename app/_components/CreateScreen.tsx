"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { listProjects } from "@/lib/client/projects";
import { SAMPLES } from "@/lib/samples";
import type { ArtStyle, Ratio } from "@/lib/spec/schema";
import { buildTimeline } from "@/lib/spec/timeline";
import { getLayout } from "@/remotion/layout";
import { DocPlayer, DocThumb } from "./client-only";
import { GenerateOverlay, type GenerateOptions } from "./GenerateOverlay";
import { ART_OPTIONS, LENGTH_OPTIONS, Logo, PlayIcon, RATIO_OPTIONS, RatioIcon, SearchIcon, SparklesIcon } from "./ui";

const EXAMPLES = [
  "The Wright brothers' first flight at Kitty Hawk",
  "How Marie Curie discovered radium",
  "Why volcanoes erupt, explained for kids",
  "The building of the Great Wall of China",
  "A shy robot who learns to paint (fiction)",
  "How the internet was born",
];

const PLACEHOLDERS = [
  "The Apollo 11 Moon landing, told for 10-year-olds…",
  "How the printing press changed the world…",
  "My grandmother's journey from Dhaka to London in 1965…",
  "Why the dinosaurs went extinct…",
];

function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
        active ? "bg-white text-ink shadow" : "text-zinc-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-white/5 p-1 ring-1 ring-white/10" role="group" aria-label={label}>
      {children}
    </div>
  );
}

const emptySubscribe = () => () => {};

export function CreateScreen() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [art, setArt] = useState<ArtStyle>("flat");
  const [ratio, setRatio] = useState<Ratio>("16:9");
  const [lengthSec, setLengthSec] = useState(60);
  const [research, setResearch] = useState(true);
  const [job, setJob] = useState<GenerateOptions | null>(null);
  const [placeholder, setPlaceholder] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Saved projects live in localStorage: read them only on the client.
  const projects = useSyncExternalStore(emptySubscribe, () => JSON.stringify(listProjects()), () => "[]");
  const myVideos = useMemo(() => JSON.parse(projects) as ReturnType<typeof listProjects>, [projects]);

  useEffect(() => {
    const id = setInterval(() => setPlaceholder((p) => (p + 1) % PLACEHOLDERS.length), 3500);
    return () => clearInterval(id);
  }, []);

  const hero = SAMPLES[0];
  const heroTimeline = useMemo(() => buildTimeline(hero.spec), [hero]);
  const heroLayout = getLayout("16:9");

  const canGenerate = prompt.trim().length >= 3;
  const start = () => {
    if (!canGenerate) {
      textareaRef.current?.focus();
      return;
    }
    setJob({ prompt: prompt.trim(), art, ratio, lengthSec, research });
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* ambient background */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-violet-600/25 blur-[120px]" />
        <div className="absolute right-[-10%] top-[10%] h-[420px] w-[420px] rounded-full bg-brand-2/15 blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[30%] h-[480px] w-[480px] rounded-full bg-sky-500/10 blur-[140px]" />
      </div>

      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-1 text-sm text-zinc-400">
          <a href="#examples" className="rounded-full px-3 py-1.5 hover:bg-white/5 hover:text-white">
            Examples
          </a>
          {myVideos.length ? (
            <a href="#my-videos" className="rounded-full px-3 py-1.5 hover:bg-white/5 hover:text-white">
              My videos
            </a>
          ) : null}
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-24 sm:px-8">
        {/* Hero */}
        <section className="grid items-center gap-10 pt-6 lg:grid-cols-[1.05fr_1fr] lg:pt-12">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300 ring-1 ring-white/10">
              <SparklesIcon className="h-3.5 w-3.5 text-brand" /> Claude directs · Remotion animates
            </p>
            <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Tell a story.
              <br />
              <span className="bg-linear-to-r from-brand via-orange-300 to-brand-2 bg-clip-text text-transparent">Get an animated documentary.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-zinc-400">
              Type any topic or story. We research the facts, write the script, cast the characters and animate every scene — ready for YouTube, Shorts, Reels and Instagram.
            </p>
          </div>

          <div className="relative">
            <div className="absolute -inset-3 rounded-[28px] bg-linear-to-br from-brand/30 via-brand-2/20 to-violet-500/30 blur-2xl" aria-hidden />
            <div className="relative overflow-hidden rounded-3xl bg-black ring-1 ring-white/15 shadow-2xl" style={{ aspectRatio: "16 / 9" }}>
              <DocPlayer
                inputProps={{ spec: hero.spec, ratio: "16:9" }}
                durationInFrames={heroTimeline.durationInFrames}
                fps={heroTimeline.fps}
                width={heroLayout.width}
                height={heroLayout.height}
                initialFrame={130}
                controls={false}
                autoPlay
                loop
              />
              <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white/90 backdrop-blur">Made with StoryMotion · {hero.label}</div>
            </div>
          </div>
        </section>

        {/* Prompt */}
        <section className="mt-12" aria-label="Create a video">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start();
            }}
            className="rounded-3xl bg-white/[0.04] p-2 ring-1 ring-white/10 shadow-2xl shadow-black/40 backdrop-blur-xl focus-within:ring-brand/50"
          >
            <label htmlFor="story" className="sr-only">
              Your story
            </label>
            <textarea
              id="story"
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start();
              }}
              rows={3}
              placeholder={PLACEHOLDERS[placeholder]}
              className="w-full resize-none bg-transparent px-4 pt-4 text-lg text-white placeholder:text-zinc-500 focus:outline-none sm:text-xl"
            />
            <div className="flex flex-col gap-3 border-t border-white/10 p-2 pt-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <OptionGroup label="Art style">
                  {ART_OPTIONS.map((o) => (
                    <Chip key={o.id} active={art === o.id} onClick={() => setArt(o.id)} title={o.hint}>
                      <span className="flex -space-x-1" aria-hidden>
                        {o.swatch.map((c) => (
                          <span key={c} className="h-3 w-3 rounded-full ring-2 ring-black/30" style={{ background: c }} />
                        ))}
                      </span>
                      {o.label}
                    </Chip>
                  ))}
                </OptionGroup>
                <OptionGroup label="Format">
                  {RATIO_OPTIONS.map((o) => (
                    <Chip key={o.id} active={ratio === o.id} onClick={() => setRatio(o.id)} title={o.hint}>
                      <RatioIcon ratio={o.id} size={14} />
                      {o.label}
                    </Chip>
                  ))}
                </OptionGroup>
                <OptionGroup label="Length">
                  {LENGTH_OPTIONS.map((o) => (
                    <Chip key={o.sec} active={lengthSec === o.sec} onClick={() => setLengthSec(o.sec)}>
                      {o.label}
                    </Chip>
                  ))}
                </OptionGroup>
                <button
                  type="button"
                  role="switch"
                  aria-checked={research}
                  onClick={() => setResearch((r) => !r)}
                  title="Claude searches the web, checks facts and lists sources at the end"
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm ring-1 transition ${
                    research ? "bg-emerald-400/10 text-emerald-200 ring-emerald-400/30" : "bg-white/5 text-zinc-400 ring-white/10"
                  }`}
                >
                  <SearchIcon className="h-3.5 w-3.5" />
                  Fact-check {research ? "on" : "off"}
                </button>
              </div>
              <button
                type="submit"
                className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-linear-to-r from-brand to-orange-400 px-6 py-3.5 font-display text-lg font-semibold text-ink shadow-lg shadow-orange-500/20 transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
                disabled={!canGenerate}
              >
                <SparklesIcon className="h-5 w-5" />
                Create video
              </button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-zinc-500">Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setPrompt(ex);
                  textareaRef.current?.focus();
                }}
                className="rounded-full bg-white/5 px-3 py-1.5 text-sm text-zinc-300 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white"
              >
                {ex}
              </button>
            ))}
          </div>
        </section>

        {/* My videos */}
        {myVideos.length ? (
          <section id="my-videos" className="mt-20">
            <h2 className="font-display text-2xl font-semibold">My videos</h2>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {myVideos.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/studio?id=${p.id}`}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10 transition hover:bg-white/[0.07]"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.title}</div>
                      <div className="truncate text-sm text-zinc-500">{p.prompt}</div>
                    </div>
                    <span className="shrink-0 text-xs text-zinc-500">{new Date(p.updatedAt).toLocaleDateString()}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Examples */}
        <section id="examples" className="mt-20">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-semibold">Made with StoryMotion</h2>
              <p className="mt-1 text-zinc-400">Every frame is animated by Remotion from a plan Claude wrote. Open one to explore and edit it.</p>
            </div>
          </div>
          <ul className="mt-6 grid gap-6 md:grid-cols-2">
            {SAMPLES.map((s) => (
              <SampleCard key={s.id} sample={s} />
            ))}
          </ul>
        </section>
      </main>

      {job ? (
        <GenerateOverlay
          options={job}
          onClose={() => setJob(null)}
          onDone={(id) => router.push(`/studio?id=${id}`)}
        />
      ) : null}
    </div>
  );
}

function SampleCard({ sample }: { sample: (typeof SAMPLES)[number] }) {
  const timeline = useMemo(() => buildTimeline(sample.spec), [sample]);
  const layout = getLayout("16:9");
  const scene = timeline.segments.filter((s) => s.kind === "scene")[2] ?? timeline.segments[0];
  const sceneCount = timeline.segments.filter((s) => s.kind === "scene").length;
  return (
    <li>
      <Link href={`/studio?id=sample:${sample.id}`} className="group block">
        <div className="relative overflow-hidden rounded-2xl bg-black ring-1 ring-white/10 transition group-hover:ring-brand/50" style={{ aspectRatio: "16 / 9" }}>
          <DocThumb
            inputProps={{ spec: sample.spec, ratio: "16:9" }}
            frame={scene.from + Math.round(scene.durationInFrames * 0.6)}
            durationInFrames={timeline.durationInFrames}
            fps={timeline.fps}
            width={layout.width}
            height={layout.height}
          />
          <div className="absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/30">
            <span className="grid h-14 w-14 scale-90 place-items-center rounded-full bg-white/90 text-ink opacity-0 transition group-hover:scale-100 group-hover:opacity-100">
              <PlayIcon className="h-6 w-6 translate-x-0.5" />
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <div className="font-display text-lg font-semibold">{sample.label}</div>
            <div className="text-sm text-zinc-400">“{sample.prompt}”</div>
          </div>
          <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-xs text-zinc-400 ring-1 ring-white/10">
            {Math.round(timeline.durationInFrames / timeline.fps)}s · {sceneCount} scenes
          </span>
        </div>
      </Link>
    </li>
  );
}
