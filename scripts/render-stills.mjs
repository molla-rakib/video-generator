// Renders still frames of the sample documentaries in every aspect ratio,
// so layouts can be checked visually (by a human, or by Claude's vision QA pass).
//
// Usage:
//   npm run stills                                   # all samples, all ratios, 8 frames each
//   npm run stills -- --sample=wright --ratios=4x5,9x16 --frames=120,450 --scale=0.5
//
// Output: out/stills/<sample>-<ratio>-f<frame>.png

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderStill } from "@remotion/renderer";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);

const OUT = path.join("out", "stills");
const scale = Number(args.scale ?? 0.5);
const wantSample = args.sample;
const wantRatios = args.ratios?.split(",");
const wantFrames = args.frames?.split(",").map(Number);
const count = Number(args.count ?? 8);

await mkdir(OUT, { recursive: true });

console.log("Bundling…");
const serveUrl = await bundle({ entryPoint: path.resolve("remotion/index.ts") });
const comps = (await getCompositions(serveUrl)).filter((c) => !c.id.startsWith("Doc-"));

for (const comp of comps) {
  const [sample, ratio] = [comp.id.slice(0, comp.id.lastIndexOf("-")), comp.id.slice(comp.id.lastIndexOf("-") + 1)];
  if (wantSample && sample !== wantSample) continue;
  if (wantRatios && !wantRatios.includes(ratio)) continue;

  const frames =
    wantFrames ??
    Array.from({ length: count }, (_, i) => Math.round(((i + 0.5) / count) * (comp.durationInFrames - 1)));

  for (const frame of frames) {
    const output = path.join(OUT, `${sample}-${ratio}-f${frame}.png`);
    await renderStill({ composition: comp, serveUrl, frame, output, scale, inputProps: comp.props });
    console.log(`✓ ${output}`);
  }
  console.log(`  ${comp.id}: ${comp.durationInFrames} frames (${(comp.durationInFrames / comp.fps).toFixed(1)}s)`);
}
