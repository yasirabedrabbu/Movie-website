// Movie scanner v2
//
//   node scan.js                 full scan + file sizes
//   node scan.js --tmdb          also resolve TMDB ids (needs TMDB_TOKEN)
//   node scan.js --no-sizes      skip the HEAD requests (fast, no sizes)
//   node scan.js --refresh       ignore the size/TMDB cache
//   node scan.js --only=Hindi    scan one category -> writes movies.only.json
//   node scan.js --force         overwrite movies.json even if the scan looks broken
//
// Config comes from ../web/.env (MEDIA_BASE_URL, TMDB_TOKEN). Needs Node 20.12+.

import { writeFile, readFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Share one config file with the website.
try { process.loadEnvFile(resolve(__dirname, "../web/.env")); } catch { /* use real env */ }

// ---------------------------------------------------------------------------
// CLI + config
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const opt = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

const WITH_SIZES = !has("no-sizes");
const WITH_TMDB = has("tmdb");
const REFRESH = has("refresh");
const FORCE = has("force");
const ONLY = opt("only");

const BASE = (process.env.MEDIA_BASE_URL || "").replace(/\/+$/, "");
if (!BASE) {
  console.error("MEDIA_BASE_URL is not set. Copy web/.env.example to web/.env and fill it in.");
  process.exit(1);
}
if (WITH_TMDB && !process.env.TMDB_TOKEN) {
  console.error("--tmdb needs TMDB_TOKEN in web/.env");
  process.exit(1);
}

const TMDB_API = "https://api.themoviedb.org/3";
const enc = (p) => `${BASE}/${p}/`;

// type "series" roots are skipped here; the series scanner (next batch) owns them.
const ROOTS = [
  { category: "Hindi", type: "movie", url: enc("Hindi%20Movies") },
  { category: "English", type: "movie", url: enc("English%20Movies") },
  { category: "English", type: "movie", url: enc("English%20Movies%20(1080p)") },
  { category: "South", type: "movie", url: enc("SOUTH%20INDIAN%20MOVIES") },
  { category: "South", type: "movie", url: enc("SOUTH-MOVIE%20HINDI%20DUBBED") },
  { category: "Animation", type: "movie", url: enc("Animation%20Movies") },
  { category: "Animation", type: "movie", url: enc("Animation%20Movies%20(1080p)") },
  { category: "Documentary", type: "movie", url: enc("DOCUMENTARY") },
  { category: "Korean", type: "series", url: enc("KOREAN%20TV%20%26%20WEB%20Series") },
  { category: "Series", type: "series", url: enc("TV%20%26%20WEB%20Series") },
];
// Categories the site expects to have movies in. Reported if empty.
const EXPECTED = ["Hindi", "English", "South", "Animation", "Documentary"];

const VIDEO = /\.(mkv|mp4|avi|webm|m4v)$/i;
const IMAGE = /\.(jpe?g|png|webp)$/i;
const SUB = /\.(srt|vtt)$/i;
const CONCURRENCY = 8;
const RANK = { "2160p": 4, "1080p": 3, "720p": 2, "480p": 1 };

const OUT = resolve(__dirname, ONLY ? "../web/public/movies.only.json" : "../web/public/movies.json");
const REPORT = resolve(__dirname, "scan-report.json");
const CACHE = resolve(__dirname, ".scan-cache.json");

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastSegment = (url) => decodeURIComponent(url.replace(/\/$/, "").split("/").pop() || "");
const hash = (s) => createHash("md5").update(s).digest("hex").slice(0, 10);

async function pool(items, limit, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    })
  );
}

// fetch with timeout + retry on network errors, 429 and 5xx.
async function request(url, init = {}, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      last = e;
      await sleep(400 * (i + 1));
    }
  }
  throw last;
}

async function listDir(url) {
  const res = await request(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    if (!full.startsWith(base.origin + base.pathname)) continue; // no parent links
    if (full === base.origin + base.pathname) continue;
    if (seen.has(full)) continue;
    seen.add(full);
    (full.endsWith("/") ? dirs : files).push(full);
  }
  return { dirs, files };
}

function parseQuality(...texts) {
  for (const t of texts) {
    const m = t?.match(/(2160p|1080p|720p|480p|4k)/i);
    if (m) return m[1].toLowerCase() === "4k" ? "2160p" : m[1].toLowerCase();
  }
  return null;
}

function parseTitle(folderName) {
  const year = folderName.match(/\((\d{4})\)/)?.[1] || null;
  const title = (folderName.split("(")[0] || folderName).replace(/[-_.]+$/, "").trim();
  return { title: title || folderName, year: year ? Number(year) : null };
}

// ---------------------------------------------------------------------------
// Crawl: one entry per folder that contains video files (= one quality version)
// ---------------------------------------------------------------------------
async function crawl(root, stats) {
  const found = [];
  const queue = [root.url];
  let active = 0;

  async function visit(url) {
    const { dirs, files } = await listDir(url);
    stats.folders++;
    const videos = files.filter((f) => VIDEO.test(f));
    if (videos.length === 0) {
      queue.push(...dirs);
      return;
    }
    const folder = lastSegment(url);
    found.push({
      category: root.category,
      folder,
      ...parseTitle(folder),
      quality: parseQuality(folder, lastSegment(videos[0])),
      path: url,
      poster: files.find((f) => IMAGE.test(f)) || null,
      subtitles: files.filter((f) => SUB.test(f)),
      files: videos.map((v) => ({
        url: v,
        name: lastSegment(v),
        ext: v.split(".").pop().toLowerCase(),
        size: null,
        modified: null,
      })),
    });
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
      try { await visit(url); }
      catch (e) {
        const msg = `${url} -> ${e.message}`;
        stats.errors.push(msg);
        console.warn(`  ! ${msg}`);
      }
      finally { active--; }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return found;
}

// ---------------------------------------------------------------------------
// Group quality versions into one movie
// FIX: the old dedupe kept the first folder and dropped every other quality.
// ---------------------------------------------------------------------------
function groupMovies(entries) {
  const groups = new Map();
  let duplicates = 0;

  for (const e of entries) {
    const key = `${e.title.toLowerCase()}|${e.year}`;
    if (!groups.has(key)) groups.set(key, { key, title: e.title, year: e.year, versions: [] });
    const g = groups.get(key);
    const dupe = g.versions.some((v) => v.path === e.path || (e.quality && v.quality === e.quality));
    if (dupe) { duplicates++; continue; }
    g.versions.push(e);
  }

  const movies = [...groups.values()].map((g) => {
    const versions = g.versions.sort((a, b) => (RANK[b.quality] || 0) - (RANK[a.quality] || 0));
    const primary = versions[0];
    return {
      id: hash(g.key), // stable: depends only on title + year, not on which folder won
      category: primary.category,
      title: g.title,
      year: g.year,
      tmdbId: null,
      // Fields below mirror the primary (best quality) version so the current UI keeps working.
      quality: primary.quality,
      folder: primary.folder,
      path: primary.path,
      video: primary.files[0].url,
      videos: primary.files.map((f) => f.url),
      subtitles: primary.subtitles,
      poster: versions.find((v) => v.poster)?.poster || null,
      size: null,
      modified: null,
      qualities: versions.map((v) => v.quality).filter(Boolean),
      versions: versions.map((v) => ({
        quality: v.quality,
        category: v.category,
        folder: v.folder,
        path: v.path,
        poster: v.poster,
        subtitles: v.subtitles,
        size: null,
        files: v.files,
      })),
    };
  });

  return { movies, duplicates };
}

// ---------------------------------------------------------------------------
// File sizes (HEAD -> Content-Length / Last-Modified), cached by URL
// ---------------------------------------------------------------------------
async function fillSizes(movies, cache) {
  const files = movies.flatMap((m) => m.versions.flatMap((v) => v.files));
  const todo = REFRESH ? files : files.filter((f) => !(f.url in cache.sizes));
  console.log(`Sizes: ${files.length} files, ${todo.length} to fetch`);

  let done = 0;
  let failed = 0;
  await pool(todo, CONCURRENCY, async (f) => {
    try {
      const res = await request(f.url, { method: "HEAD" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const len = Number(res.headers.get("content-length"));
      const lm = res.headers.get("last-modified");
      cache.sizes[f.url] = {
        size: Number.isFinite(len) && len > 0 ? len : null,
        modified: lm && !Number.isNaN(Date.parse(lm)) ? new Date(lm).toISOString() : null,
      };
    } catch {
      failed++; // not cached, so the next run retries it
    }
    if (++done % 500 === 0) console.log(`  ${done}/${todo.length}`);
  });

  for (const f of files) {
    const c = cache.sizes[f.url];
    if (c) { f.size = c.size; f.modified = c.modified; }
  }
  for (const m of movies) {
    for (const v of m.versions) {
      // Only trust the total when every file has a size.
      v.size = v.files.every((f) => f.size) ? v.files.reduce((s, f) => s + f.size, 0) : null;
    }
    const p = m.versions[0];
    m.size = p.size;
    m.modified = p.files.map((f) => f.modified).filter(Boolean).sort().pop() || null;
  }
  return { total: files.length, withSize: files.filter((f) => f.size).length, failed };
}

// ---------------------------------------------------------------------------
// TMDB ids (opt-in with --tmdb)
// ---------------------------------------------------------------------------
async function lookupTmdb(title, year) {
  const search = async (withYear) => {
    const qs = new URLSearchParams({ query: title });
    if (withYear && year) qs.set("year", year);
    const res = await request(`${TMDB_API}/search/movie?${qs}`, {
      headers: { Authorization: `Bearer ${process.env.TMDB_TOKEN}`, accept: "application/json" },
    });
    if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
    return (await res.json()).results || [];
  };
  const pick = (results) =>
    results.find((r) => {
      if (!year) return true;
      const y = Number(r.release_date?.slice(0, 4));
      return y && Math.abs(y - year) <= 1; // a 5-year gap is a different movie
    });
  return (pick(await search(true)) || pick(await search(false)))?.id ?? null;
}

async function fillTmdb(movies, cache) {
  const todo = REFRESH ? movies : movies.filter((m) => !(m.id in cache.tmdb));
  console.log(`TMDB: ${movies.length} movies, ${todo.length} to look up`);

  let done = 0;
  let failed = 0;
  await pool(todo, 5, async (m) => {
    try {
      cache.tmdb[m.id] = await lookupTmdb(m.title, m.year); // null = genuinely no match
    } catch {
      failed++; // errors are NOT cached
    }
    if (++done % 200 === 0) console.log(`  ${done}/${todo.length}`);
  });

  for (const m of movies) m.tmdbId = cache.tmdb[m.id] ?? null;
  return { matched: movies.filter((m) => m.tmdbId).length, failed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function loadJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; }
}

async function main() {
  const cache = await loadJson(CACHE, { sizes: {}, tmdb: {} });
  cache.sizes ||= {};
  cache.tmdb ||= {};

  const entries = [];
  const rootReports = [];

  for (const root of ROOTS) {
    if (ONLY && root.category.toLowerCase() !== ONLY.toLowerCase()) continue;
    if (root.type === "series") {
      console.log(`Skipping ${root.category} (series, handled by the series scanner)`);
      rootReports.push({ ...root, skipped: true });
      continue;
    }
    console.log(`Scanning ${root.category}: ${root.url}`);
    const stats = { folders: 0, errors: [] };
    const found = await crawl(root, stats);
    entries.push(...found);
    rootReports.push({
      category: root.category,
      type: root.type,
      url: root.url,
      folders: stats.folders,
      versionsFound: found.length,
      errors: stats.errors.length,
      firstError: stats.errors[0] || null,
    });
    if (found.length === 0) console.warn(`  ! ${root.category}: nothing found at ${root.url}`);
  }

  const { movies, duplicates } = groupMovies(entries);

  const sizeInfo = WITH_SIZES ? await fillSizes(movies, cache) : null;
  const tmdbInfo = WITH_TMDB ? await fillTmdb(movies, cache) : null;
  if (WITH_SIZES || WITH_TMDB) await writeFile(CACHE, JSON.stringify(cache));

  const categoryCounts = {};
  for (const m of movies) categoryCounts[m.category] = (categoryCounts[m.category] || 0) + 1;
  const missingCategories = ONLY ? [] : EXPECTED.filter((c) => !categoryCounts[c]);

  // Safety: do not clobber a good movies.json with a broken scan (server down, wrong URL).
  const previous = await loadJson(OUT, null);
  if (!FORCE && previous?.count && movies.length < previous.count * 0.5) {
    console.error(
      `\nAborted: scan found ${movies.length} movies but the current file has ${previous.count}. ` +
        `Check MEDIA_BASE_URL / the server, or re-run with --force.`
    );
    process.exit(1);
  }

  await mkdir(dirname(OUT), { recursive: true });
  const tmp = `${OUT}.tmp`;
  await writeFile(
    tmp,
    JSON.stringify({ generatedAt: new Date().toISOString(), count: movies.length, movies }, null, 2)
  );
  await rename(tmp, OUT); // atomic: readers never see a half-written file

  const report = {
    generatedAt: new Date().toISOString(),
    movies: movies.length,
    versions: entries.length - duplicates,
    duplicatesSkipped: duplicates,
    categoryCounts,
    missingCategories,
    roots: rootReports,
    sizes: sizeInfo,
    tmdb: tmdbInfo,
  };
  await writeFile(REPORT, JSON.stringify(report, null, 2));

  console.log(`\nDone. ${movies.length} movies (${report.versions} quality versions) -> ${OUT}`);
  console.log("Per category:", categoryCounts);
  if (missingCategories.length) console.warn(`MISSING categories (0 movies): ${missingCategories.join(", ")}`);
  if (sizeInfo) console.log(`Sizes: ${sizeInfo.withSize}/${sizeInfo.total} files, ${sizeInfo.failed} failed`);
  if (tmdbInfo) console.log(`TMDB: ${tmdbInfo.matched}/${movies.length} matched, ${tmdbInfo.failed} failed`);
  console.log(`Report -> ${REPORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});