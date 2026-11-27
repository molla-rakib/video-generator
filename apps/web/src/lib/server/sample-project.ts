import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { projectFile } from "@studio/database";
import { getStorage, repoRoot } from "@studio/media";
import type { AspectRatio } from "@studio/shared";
import { addClip, addMarker, createTimeline, ensureTrack, type Timeline } from "@studio/timeline";

/**
 * A ready-made sample project: three original cartoon scenes (Remotion
 * components, exactly like the AI agent writes them), a music bed, sound
 * effects and Bangla captions. It lets you try every editor feature before
 * connecting an AI agent.
 *
 * The sounds are synthesised here so the sample needs no downloads.
 */

const SAMPLE_DIR = () => path.join(/*turbopackIgnore: true*/ repoRoot(), "samples", "starter");
const RATE = 44_100;

// ---- tiny synthesiser ------------------------------------------------------

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wav(samples: Float32Array): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 32767), i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const note = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** A calm pad: C – Am – F – G, with a soft bass. */
function musicBed(seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  const chords = [
    [60, 64, 67],
    [57, 60, 64],
    [53, 57, 60],
    [55, 59, 62],
  ];
  const chordLen = 3;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const idx = Math.floor(t / chordLen) % chords.length;
    const local = t % chordLen;
    const env = Math.min(1, local / 0.6) * Math.min(1, (chordLen - local) / 0.5);
    let v = 0;
    for (const m of chords[idx]!) {
      const f = note(m) * (1 + 0.002 * Math.sin(2 * Math.PI * 5 * t));
      v += Math.sin(2 * Math.PI * f * t) * 0.09 + Math.sin(2 * Math.PI * f * 2 * t) * 0.02;
    }
    v += Math.sin(2 * Math.PI * note(chords[idx]![0]! - 24) * t) * 0.12;
    // A gentle plucked arpeggio on top.
    const step = Math.floor(t / 0.375);
    const pluckT = t - step * 0.375;
    const pluck = note(chords[idx]![step % 3]! + 12);
    v += Math.sin(2 * Math.PI * pluck * t) * Math.exp(-pluckT * 7) * 0.08;
    out[i] = v * env;
  }
  return out;
}

function chime(seconds = 1.6): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    out[i] = [1046.5, 1568, 2093].reduce((s, f, k) => s + Math.sin(2 * Math.PI * f * t) * Math.exp(-t * (3 + k * 2)) * (0.35 / (k + 1)), 0);
  }
  return out;
}

function thunder(seconds = 3.5): Float32Array {
  const rand = rng(7);
  const out = new Float32Array(Math.round(seconds * RATE));
  let brown = 0;
  let low = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    brown = (brown + (rand() * 2 - 1) * 0.04) * 0.995;
    low += (brown - low) * 0.05;
    const crack = t < 0.15 ? (rand() * 2 - 1) * (1 - t / 0.15) * 0.5 : 0;
    const rumble = 1 + 0.5 * Math.sin(2 * Math.PI * 3 * t) * Math.sin(2 * Math.PI * 0.7 * t);
    const env = Math.min(1, t / 0.02) * Math.exp(-t * 1.1);
    out[i] = (low * 9 * rumble + crack) * env;
  }
  return out;
}

function rain(seconds = 6): Float32Array {
  const rand = rng(42);
  const out = new Float32Array(Math.round(seconds * RATE));
  let prev = 0;
  let lp = 0;
  for (let i = 0; i < out.length; i++) {
    const white = rand() * 2 - 1;
    const hiss = white - prev; // brighten
    prev = white;
    lp += (hiss - lp) * 0.35;
    const drop = rand() < 0.0009 ? (rand() * 2 - 1) * 0.6 : 0;
    out[i] = lp * 0.25 + drop;
  }
  // Smooth the clicks a little.
  for (let i = 1; i < out.length; i++) out[i] = out[i]! * 0.7 + out[i - 1]! * 0.3;
  return out;
}

// ---- the project -------------------------------------------------------------

/** Write the sample's files into the project folder and return its timeline. */
export async function buildSampleProject(projectId: string, ratio: AspectRatio): Promise<{ timeline: Timeline; mediaFiles: Array<{ path: string; role: string; name: string }> }> {
  const storage = getStorage();
  const sceneDir = path.join(SAMPLE_DIR(), "scenes");
  for (const name of await readdir(sceneDir)) {
    await storage.put(projectFile(projectId, `scenes/${name}`), await readFile(path.join(sceneDir, name)));
  }
  const mediaFiles = [
    { path: "audio/music/calm-bed.wav", role: "music", name: "Calm music bed", data: musicBed(18) },
    { path: "audio/sfx/chime.wav", role: "sfx", name: "Chime", data: chime() },
    { path: "audio/sfx/thunder.wav", role: "sfx", name: "Thunder", data: thunder() },
    { path: "audio/sfx/rain.wav", role: "sfx", name: "Rain", data: rain() },
  ];
  for (const f of mediaFiles) await storage.put(projectFile(projectId, f.path), wav(f.data));

  const others = (["9:16", "16:9", "4:5"] as const).filter((r) => r !== ratio);
  let t = createTimeline({ fps: 30, ratio, ratios: [ratio, ...others] });
  // Transitions only where the shots really connect (the studio's built-in rule); otherwise a clean cut.
  const scene = (component: string, label: string, start: number, duration: number, props: Record<string, unknown>, transition: "none" | "morph" | "zoom_through") => {
    t = addClip(t, { trackId: "scenes", kind: "scene", component, label, start, duration, props, transition, transitionDuration: 0.9 }).timeline;
    t = addMarker(t, { time: start, label });
  };
  scene("scenes/NightTown.tsx", "Night town", 0, 6, { lightLevel: 1, cameraZoom: 1.25 }, "none");
  scene("scenes/Friend.tsx", "A friend", 6, 6, { expression: "happy", color: "#f2b84b" }, "none");
  scene("scenes/Storm.tsx", "Storm", 12, 6, { rain: 0.8, flashAt: 1.2 }, "none");

  t = addClip(t, {
    trackId: "music",
    kind: "audio",
    src: "audio/music/calm-bed.wav",
    label: "Calm music bed",
    start: 0,
    duration: 13.2,
    sourceDuration: 18,
    volume: 0.5,
    fadeIn: 1,
    fadeOut: 0.4,
    meta: { mood: "calm", source: "sample" },
  }).timeline;
  const sfx = (src: string, label: string, start: number, duration: number, volume: number, prompt: string) => {
    t = addClip(t, { trackId: "sfx", kind: "audio", src, label, start, duration, sourceDuration: duration, volume, meta: { prompt } }).timeline;
  };
  sfx("audio/sfx/chime.wav", "Chime", 6.1, 1.6, 0.45, "soft magical chime as the character appears");
  sfx("audio/sfx/thunder.wav", "Thunder", 13.2, 3.5, 0.6, "close thunder crack with long rumble");
  const ambience = ensureTrack(t, "ambience");
  t = addClip(ambience.timeline, {
    trackId: ambience.track.id,
    kind: "audio",
    src: "audio/sfx/rain.wav",
    label: "Rain",
    start: 12,
    duration: 6,
    sourceDuration: 6,
    volume: 0.35,
    fadeIn: 1,
    fadeOut: 0.5,
    meta: { prompt: "steady light rain on grass" },
  }).timeline;

  const caption = (text: string, start: number, duration: number) => {
    t = addClip(t, { trackId: "captions", kind: "caption", text, start, duration }).timeline;
  };
  caption("এক রাতে, ছোট্ট এক শহরে…", 0.4, 5.2);
  caption("সকালে দেখা হলো এক নতুন বন্ধুর সাথে।", 6.4, 5.2);
  caption("হঠাৎ নামল ঝড়-বৃষ্টি!", 12.4, 5.2);

  return { timeline: t, mediaFiles: mediaFiles.map(({ path: p, role, name }) => ({ path: p, role, name })) };
}
