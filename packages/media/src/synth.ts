/**
 * A tiny sound synthesiser — used when ElevenLabs isn't connected, so the
 * agent can still give every video music and sound effects. Everything is
 * generated in code (no downloads) and written as 44.1 kHz mono WAV.
 */

export const SAMPLE_RATE = 44_100;

export const SYNTH_PRESETS = ["rain", "thunder", "chime", "whoosh", "pop", "wind", "heartbeat", "click", "tick", "knock", "footsteps", "sting", "magic", "bell"] as const;
export type SynthPreset = (typeof SYNTH_PRESETS)[number];

export const MUSIC_MOODS = ["calm", "happy", "sad", "tense", "mysterious", "hopeful", "dramatic"] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];

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

/** Encode samples (-1…1) as a 16-bit mono WAV file. */
export function encodeWav(samples: Float32Array): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 32767), i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const note = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
const buf = (seconds: number) => new Float32Array(Math.max(1, Math.round(seconds * SAMPLE_RATE)));

/** Scale to a peak of `peak` so every sound sits at a predictable level. */
function normalise(out: Float32Array, peak = 0.8): Float32Array {
  let max = 0;
  for (const v of out) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i]! / max) * peak;
  return out;
}

function fadeEdges(out: Float32Array, inSec = 0.01, outSec = 0.05): Float32Array {
  const a = Math.round(inSec * SAMPLE_RATE);
  const b = Math.round(outSec * SAMPLE_RATE);
  for (let i = 0; i < Math.min(a, out.length); i++) out[i]! *= i / a;
  for (let i = 0; i < Math.min(b, out.length); i++) out[out.length - 1 - i]! *= i / b;
  return out;
}

function noise(seconds: number, seed: number, color: "white" | "brown" | "bright" = "white"): Float32Array {
  const rand = rng(seed);
  const out = buf(seconds);
  let brown = 0;
  let prev = 0;
  for (let i = 0; i < out.length; i++) {
    const w = rand() * 2 - 1;
    if (color === "brown") {
      brown = (brown + w * 0.04) * 0.995;
      out[i] = brown * 6;
    } else if (color === "bright") {
      out[i] = w - prev;
      prev = w;
    } else out[i] = w;
  }
  return out;
}

function lowpass(input: Float32Array, amount: number): Float32Array {
  const out = new Float32Array(input.length);
  let y = 0;
  for (let i = 0; i < input.length; i++) {
    y += (input[i]! - y) * amount;
    out[i] = y;
  }
  return out;
}

/** A synthesised sound effect, `seconds` long (presets have sensible natural lengths). */
export function synthEffect(preset: SynthPreset, seconds = 2, seed = 1): Float32Array {
  const t = (i: number) => i / SAMPLE_RATE;
  switch (preset) {
    case "rain": {
      const hiss = lowpass(noise(seconds, seed, "bright"), 0.35);
      const rand = rng(seed + 9);
      for (let i = 0; i < hiss.length; i++) hiss[i] = hiss[i]! * 0.3 + (rand() < 0.0009 ? (rand() * 2 - 1) * 0.6 : 0);
      return fadeEdges(normalise(lowpass(hiss, 0.7), 0.6), 0.4, 0.6);
    }
    case "thunder": {
      const len = Math.max(seconds, 2.5);
      const low = lowpass(noise(len, seed, "brown"), 0.05);
      const rand = rng(seed + 3);
      for (let i = 0; i < low.length; i++) {
        const x = t(i);
        const crack = x < 0.15 ? (rand() * 2 - 1) * (1 - x / 0.15) * 0.4 : 0;
        low[i] = (low[i]! * (1 + 0.5 * Math.sin(2 * Math.PI * 3 * x)) + crack) * Math.min(1, x / 0.02) * Math.exp(-x * 1.1);
      }
      return normalise(low, 0.9);
    }
    case "wind": {
      const len = Math.max(seconds, 1);
      const w = lowpass(noise(len, seed), 0.02);
      for (let i = 0; i < w.length; i++) w[i]! *= 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.3 * t(i) + Math.sin(t(i)));
      return fadeEdges(normalise(w, 0.6), 0.5, 0.8);
    }
    case "whoosh": {
      const len = Math.min(Math.max(seconds, 0.5), 1.5);
      const w = noise(len, seed);
      let y = 0;
      for (let i = 0; i < w.length; i++) {
        const p = t(i) / len;
        y += (w[i]! - y) * (0.02 + 0.25 * Math.sin(Math.PI * p));
        w[i] = y * Math.sin(Math.PI * p);
      }
      return normalise(w, 0.75);
    }
    case "pop": {
      const out = buf(0.25);
      for (let i = 0; i < out.length; i++) out[i] = Math.sin(2 * Math.PI * (600 - 400 * (t(i) / 0.25)) * t(i)) * Math.exp(-t(i) * 25);
      return normalise(out, 0.8);
    }
    case "chime":
    case "bell":
    case "magic": {
      const len = Math.max(seconds, preset === "bell" ? 2.5 : 1.6);
      const out = buf(len);
      const freqs = preset === "bell" ? [523.25, 1046.5, 1318.5, 2093] : preset === "magic" ? [1046.5, 1318.5, 1568, 2093, 2637] : [1046.5, 1568, 2093];
      for (let i = 0; i < out.length; i++) {
        const x = t(i);
        out[i] = freqs.reduce((s, f, k) => {
          const start = preset === "magic" ? k * 0.08 : 0;
          if (x < start) return s;
          return s + Math.sin(2 * Math.PI * f * (x - start)) * Math.exp(-(x - start) * (2.5 + k)) / (k + 1);
        }, 0);
      }
      return normalise(out, 0.6);
    }
    case "heartbeat": {
      const len = Math.max(seconds, 1.6);
      const out = buf(len);
      for (let i = 0; i < out.length; i++) {
        const x = t(i) % 0.85;
        const beat = (s: number) => (x > s ? Math.sin(2 * Math.PI * 55 * (x - s)) * Math.exp(-(x - s) * 18) : 0);
        out[i] = beat(0) + 0.7 * beat(0.22);
      }
      return normalise(out, 0.85);
    }
    case "click":
    case "tick": {
      const len = preset === "tick" ? Math.max(seconds, 1) : 0.08;
      const out = buf(len);
      for (let i = 0; i < out.length; i++) {
        const x = preset === "tick" ? t(i) % 0.5 : t(i);
        out[i] = Math.sin(2 * Math.PI * 3200 * x) * Math.exp(-x * 220);
      }
      return normalise(out, 0.6);
    }
    case "knock": {
      const out = buf(1.1);
      for (let i = 0; i < out.length; i++) {
        const x = t(i);
        out[i] = [0, 0.28, 0.56].reduce((s, at) => (x > at ? s + Math.sin(2 * Math.PI * 140 * (x - at)) * Math.exp(-(x - at) * 35) : s), 0);
      }
      return normalise(lowpass(out, 0.4), 0.85);
    }
    case "footsteps": {
      const len = Math.max(seconds, 1.5);
      const steps = noise(len, seed);
      for (let i = 0; i < steps.length; i++) {
        const x = t(i) % 0.5;
        steps[i]! *= Math.exp(-x * 40);
      }
      return normalise(lowpass(steps, 0.15), 0.7);
    }
    case "sting": {
      const out = buf(Math.max(seconds, 2));
      for (let i = 0; i < out.length; i++) {
        const x = t(i);
        const env = Math.min(1, x / 0.01) * Math.exp(-x * 1.6);
        out[i] = env * ([36, 43, 48, 51].reduce((s, m) => s + Math.sin(2 * Math.PI * note(m) * x), 0) + 0.3 * Math.sin(2 * Math.PI * note(24) * x));
      }
      return normalise(out, 0.85);
    }
  }
}

const MOOD_CHORDS: Record<MusicMood, { chords: number[][]; bpm: number; bright: number }> = {
  calm: { chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], bpm: 70, bright: 0.6 },
  happy: { chords: [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]], bpm: 104, bright: 1 },
  sad: { chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [52, 55, 59]], bpm: 62, bright: 0.4 },
  tense: { chords: [[50, 53, 56], [50, 53, 57], [49, 52, 56], [50, 53, 56]], bpm: 88, bright: 0.3 },
  mysterious: { chords: [[50, 53, 57], [48, 51, 55], [46, 50, 53], [48, 52, 55]], bpm: 66, bright: 0.45 },
  hopeful: { chords: [[62, 66, 69], [59, 62, 66], [55, 59, 62], [57, 61, 64]], bpm: 84, bright: 0.8 },
  dramatic: { chords: [[45, 48, 52], [41, 45, 48], [43, 47, 50], [40, 44, 47]], bpm: 76, bright: 0.5 },
};

/** A simple music bed for a mood: pad chords, bass and a light arpeggio. */
export function synthMusic(mood: MusicMood, seconds: number): Float32Array {
  const { chords, bpm, bright } = MOOD_CHORDS[mood];
  const out = buf(seconds);
  const beat = 60 / bpm;
  const chordLen = beat * 4;
  for (let i = 0; i < out.length; i++) {
    const x = i / SAMPLE_RATE;
    const idx = Math.floor(x / chordLen) % chords.length;
    const local = x % chordLen;
    const env = Math.min(1, local / 0.5) * Math.min(1, (chordLen - local) / 0.4);
    let v = 0;
    for (const m of chords[idx]!) {
      const f = note(m) * (1 + 0.002 * Math.sin(2 * Math.PI * 5 * x));
      v += Math.sin(2 * Math.PI * f * x) * 0.08 + Math.sin(2 * Math.PI * f * 2 * x) * 0.018 * bright;
    }
    v += Math.sin(2 * Math.PI * note(chords[idx]![0]! - 24) * x) * 0.11;
    if (mood === "tense") v += Math.sin(2 * Math.PI * note(26) * x) * 0.06 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (bpm / 60) * x));
    const step = Math.floor(x / (beat / 2));
    const pluckT = x - step * (beat / 2);
    const pluck = note(chords[idx]![step % 3]! + 12);
    v += Math.sin(2 * Math.PI * pluck * x) * Math.exp(-pluckT * 7) * 0.07 * bright;
    out[i] = v * env;
  }
  return fadeEdges(normalise(out, 0.7), 1.5, 2);
}
