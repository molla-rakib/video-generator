// Downloads the public-domain / CC0 images used by the sample documentaries
// from Wikimedia Commons and writes their license + attribution data
// (the "Media Ledger") to lib/samples/media.generated.json.
//
// Usage: npm run media:samples

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const UA = "DocGenPrototype/0.1 (educational prototype)";
const OUT_DIR = path.join("public", "media", "samples");
const LEDGER = path.join("out", "media-ledger.json");
const THUMB_WIDTH = 2560;

/** id → Commons file title */
const FILES = {
  // Apollo 11
  "a11-launch": "File:Apollo 11 Launch - GPN-2000-000630.jpg",
  "a11-crew": "File:Apollo 11 Crew.jpg",
  "a11-lander": "File:Apollo 11 Lunar Lander - 5927 NASA.jpg",
  "a11-aldrin": "File:Aldrin Apollo 11.jpg",
  "a11-bootprint": "File:Apollo 11 bootprint.jpg",
  "a11-splashdown": "File:Astronauts in Lifeboat After Apollo 11 Splashdown MET DP-15797-023.jpg",
  // Wright brothers
  "wb-wilbur": "File:Wilbur Wright-crop.jpg",
  "wb-orville": "File:Orville Wright 1905-crop.jpg",
  "wb-first-flight": "File:First flight2.jpg",
  "wb-home": "File:Wright Brothers at home, 1909.jpg",
};

const ALLOWED_LICENSES = /^(public domain|cc0|pd)/i;

function stripHtml(html = "") {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (p) => access(p).then(() => true, () => false);

/** Reads pixel dimensions from a JPEG's SOF marker (Commons may serve a different size than requested). */
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    i += 2 + len;
  }
  throw new Error("Could not read JPEG size");
}

/** Download with retry + backoff on rate limits (HTTP 429) and server errors. */
async function download(url, label, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`Download failed for ${label}: ${res.status}`);
    }
    const retryAfter = Number(res.headers.get("retry-after")) || 0;
    const wait = Math.max(retryAfter * 1000, 3000 * 2 ** i);
    console.log(`  … ${res.status} for ${label}, retrying in ${wait / 1000}s`);
    await sleep(wait);
  }
  throw new Error(`Download failed for ${label} after ${attempts} attempts`);
}

async function commonsInfo(titles) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    titles: titles.join("|"),
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: String(THUMB_WIDTH),
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Credit|ImageDescription|DateTimeOriginal",
  }).toString();
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Commons API ${res.status}`);
  const data = await res.json();
  const byTitle = new Map();
  for (const page of Object.values(data.query.pages)) {
    if (!page.imageinfo) throw new Error(`Not found on Commons: ${page.title}`);
    byTitle.set(page.title, page.imageinfo[0]);
  }
  // Commons normalizes titles (e.g. underscores); map them back.
  for (const n of data.query.normalized ?? []) byTitle.set(n.from, byTitle.get(n.to));
  return byTitle;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const info = await commonsInfo(Object.values(FILES));
  const ledger = {};

  for (const [id, title] of Object.entries(FILES)) {
    const ii = info.get(title);
    const meta = ii.extmetadata ?? {};
    const license = stripHtml(meta.LicenseShortName?.value) || "Unknown";
    if (!ALLOWED_LICENSES.test(license)) {
      throw new Error(`${title} has license "${license}", which is not allowed for samples`);
    }
    const srcUrl = ii.thumburl ?? ii.url;
    const ext = path.extname(new URL(srcUrl).pathname).toLowerCase() || ".jpg";
    const file = `${id}${ext}`;
    const filePath = path.join(OUT_DIR, file);
    let buf;
    if (await exists(filePath)) {
      buf = await readFile(filePath);
    } else {
      buf = await download(srcUrl, title);
      await writeFile(filePath, buf);
      await sleep(1500); // be polite to Wikimedia
    }
    const { width, height } = jpegSize(buf);

    const author = stripHtml(meta.Artist?.value).replace(/^Creator:/, "") || "Unknown";
    ledger[id] = {
      id,
      kind: "image",
      src: `media/samples/${file}`,
      width,
      height,
      title: title.replace(/^File:/, "").replace(/\.[a-z]+$/i, ""),
      origin: "wikimedia-commons",
      pageUrl: ii.descriptionurl,
      license,
      licenseUrl: meta.LicenseUrl?.value || undefined,
      author,
      attribution: `${author} · ${license} · via Wikimedia Commons`,
      aiGenerated: false,
    };
    console.log(`✓ ${id}  ${ledger[id].width}x${ledger[id].height}  ${license}`);
  }

  await mkdir(path.dirname(LEDGER), { recursive: true });
  await writeFile(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
  console.log(`\nWrote ${Object.keys(ledger).length} items → ${LEDGER}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
