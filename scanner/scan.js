import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

// ====== CONFIG: ekhane folder URL gulo bosao ======
// Browser e URL ta khule dekho folder list dekhay kina
const ROOTS = [
  {
    category: "Hindi Movies",
    url: "http://172.16.50.14/DHAKA-FLIX-14/Hindi%20Movies/",
  },
];
// ==================================================

const VIDEO = /\.(mkv|mp4|avi|webm|m4v)$/i;
const IMAGE = /\.(jpe?g|png|webp)$/i;
const SUB = /\.(srt|vtt)$/i;
const CONCURRENCY = 8;
const MAX_MOVIES = Number(process.env.MAX_MOVIES || 0); // 0 = shob

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../web/public/movies.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
    try {
      u = new URL(href, url);
    } catch {
      continue;
    }
    if (u.origin !== base.origin) continue;
    const full = u.origin + u.pathname;
    if (!full.startsWith(base.origin + base.pathname)) continue;
    if (full === base.origin + base.pathname) continue;
    if (seen.has(full)) continue;
    seen.add(full);
    if (full.endsWith("/")) dirs.push(full);
    else files.push(full);
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
    if (MAX_MOVIES && movies.length >= MAX_MOVIES) return;
    const { dirs, files } = await listDir(url);
    const videos = files.filter((f) => VIDEO.test(f));

    if (videos.length === 0) {
      queue.push(...dirs);
      return;
    }

    // Eta ekta movie folder
    const folderName = lastSegment(url);
    const info = parseName(folderName);
    let size = null;
    let modified = null;
    try {
      const head = await fetch(videos[0], { method: "HEAD", signal: timeout() });
      size = Number(head.headers.get("content-length")) || null;
      modified = head.headers.get("last-modified")
        ? new Date(head.headers.get("last-modified")).toISOString()
        : null;
    } catch {}

    movies.push({
      id: createHash("md5").update(url).digest("hex").slice(0, 10),
      category: root.category,
      folder: folderName,
      ...info,
      poster: files.find((f) => IMAGE.test(f)) || null,
      video: videos[0],
      videos,
      subtitles: files.filter((f) => SUB.test(f)),
      size,
      modified,
      path: url,
    });
    console.log(`  + ${info.title} ${info.year ?? ""} ${info.quality ?? ""}`);
  }

  async function worker() {
    while (true) {
      const url = queue.shift();
      if (!url) {
        if (active === 0) return;
        await sleep(50);
        continue;
      }
      active++;
      try {
        await visit(url);
      } catch (e) {
        console.warn(`  ! ${e.message}`);
      } finally {
        active--;
      }
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
  all.sort((a, b) => (b.modified || "").localeCompare(a.modified || ""));

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), count: all.length, movies: all }, null, 2)
  );
  console.log(`\nDone. ${all.length} movies -> ${OUT}`);
  if (all.length === 0) {
    console.log("0 movie pawa jay nai. ROOTS er URL check koro, na hole page source amake dao.");
  }
}

main();