import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const BASE = "http://172.16.50.14/DHAKA-FLIX-14";
const enc = (p) => `${BASE}/${p}/`;

const ROOTS = [
  { category: "Hindi", url: enc("Hindi%20Movies") },
  { category: "English", url: enc("English%20Movies") },
  { category: "English", url: enc("English%20Movies%20(1080p)") },
  { category: "South", url: enc("SOUTH%20INDIAN%20MOVIES") },
  { category: "South", url: enc("SOUTH-MOVIE%20HINDI%20DUBBED") },
  { category: "Korean", url: enc("KOREAN%20TV%20%26%20WEB%20Series") },
  { category: "Animation", url: enc("Animation%20Movies") },
  { category: "Animation", url: enc("Animation%20Movies%20(1080p)") },
  { category: "Series", url: enc("TV%20%26%20WEB%20Series") },
  { category: "Documentary", url: enc("DOCUMENTARY") },
];

const VIDEO = /\.(mkv|mp4|avi|webm|m4v)$/i;
const IMAGE = /\.(jpe?g|png|webp)$/i;
const SUB = /\.(srt|vtt)$/i;
const CONCURRENCY = 8;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../web/public/movies.json");

const timeout = () => AbortSignal.timeout(20000);

async function listDir(url) {
  const res = await fetch(url, { signal: timeout() });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const html = await res.text();
  const base = new URL(url);
  const seen = new Set();
  const dirs = [];
  const files = [];
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"']+)["']/gi)) {
    const href = m[1];
    if (/^(\?|#|javascript:|mailto:)/i.test(href)) continue;
    let u;
    try { u = new URL(href, url); } catch { continue; }
    if (u.origin !== base.origin) continue;
    const full = u.origin + u.pathname;
    if (!full.startsWith(base.origin + base.pathname)) continue;
    if (full === base.origin + base.pathname) continue;
    if (seen.has(full)) continue;
    seen.add(full);
    (full.endsWith("/") ? dirs : files).push(full);
  }
  return { dirs, files };
}

function parseName(folderName) {
  const year = folderName.match(/\((\d{4})\)/)?.[1] || null;
  const quality = folderName.match(/(2160p|1080p|720p|480p|4K)/i)?.[1] || null;
  const title = (folderName.split("(")[0] || folderName).replace(/[-_.]+$/, "").trim();
  return { title: title || folderName, year: year ? Number(year) : null, quality };
}

const lastSegment = (url) =>
  decodeURIComponent(url.replace(/\/$/, "").split("/").pop() || "");

async function crawl(root) {
  const movies = [];
  const queue = [root.url];
  let active = 0;

  async function visit(url) {
    const { dirs, files } = await listDir(url);
    const videos = files.filter((f) => VIDEO.test(f));
    if (videos.length === 0) {
      queue.push(...dirs);
      return;
    }
    const folderName = lastSegment(url);
    const info = parseName(folderName);
    movies.push({
      id: createHash("md5").update(url).digest("hex").slice(0, 10),
      category: root.category,
      folder: folderName,
      ...info,
      poster: files.find((f) => IMAGE.test(f)) || null,
      video: videos[0],
      videos,
      subtitles: files.filter((f) => SUB.test(f)),
      size: null,
      modified: null,
      path: url,
    });
  }

  async function worker() {
    while (true) {
      const url = queue.shift();
      if (!url) {
        if (active === 0) return;
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }
      active++;
      try { await visit(url); }
      catch (e) { console.warn(`  ! ${e.message}`); }
      finally { active--; }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return movies;
}

async function main() {
  const all = [];
  for (const root of ROOTS) {
    console.log(`Scanning: ${root.category}`);
    all.push(...(await crawl(root)));
  }

  // Dedupe: same title + year ekbar e
  const seen = new Set();
  const unique = all.filter((m) => {
    const key = `${m.title.toLowerCase()}|${m.year}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), count: unique.length, movies: unique }, null, 2)
  );
  console.log(`\nDone. ${unique.length} unique movies -> ${OUT}`);
}

main();