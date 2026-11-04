import { writeFile, readFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

try { process.loadEnvFile(resolve(__dirname, "../web/.env")); } catch {}

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const opt = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

const WITH_SIZES = !has("no-sizes");
const WITH_TMDB = has("tmdb");
const REFRESH = has("refresh");
const FORCE = has("force");
const LIST_ROOTS = has("list-roots");
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

const RULES = [
  { test: /korean.*(tv|series)|(tv|series).*korean/i, category: "Korean", type: "series" },
  { test: /\bseries\b|\btv\b/i, category: "Series", type: "series" },
  { test: /documentar/i, category: "Documentary", type: "movie" },
  { test: /animation|cartoon|anime/i, category: "Animation", type: "movie" },
  { test: /south|tamil|telugu|malayalam|kannada/i, category: "South", type: "movie" },
  { test: /hindi|bollywood/i, category: "Hindi", type: "movie" },
  { test: /english|hollywood/i, category: "English", type: "movie" },
  { test: /korean/i, category: "Korean", type: "movie" },
];
const EXPECTED = ["Hindi", "English", "South", "Animation", "Documentary"];

const VIDEO = /\.(mkv|mp4|avi|webm|m4v)$/i;
const IMAGE = /\.(jpe?g|png|webp)$/i;
const SUB = /\.(srt|vtt)$/i;
const CONCURRENCY = 6;
const RETRY_PASSES = 3;
const RANK = { "2160p": 4, "1080p": 3, "720p": 2, "480p": 1 };

const OUT = resolve(__dirname, ONLY ? "../web/public/movies.only.json" : "../web/public/movies.json");
const REPORT = resolve(__dirname, "scan-report.json");
const CACHE = resolve(__dirname, ".scan-cache.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const lastSegment = (url) => norm(url.replace(/\/$/, "").split("/").pop() || "");
const hash = (s) => createHash("md5").update(s).digest("hex").slice(0, 10);
const reason = (e) => (e.cause?.code ? `${e.message} (${e.cause.code})` : e.message);

async function pool(items, limit, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    })
  );
}

async function request(url, init = {}, tries = 6) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      last = e;
      await sleep(Math.min(500 * 2 ** i, 8000));
    }
  }
  throw last;
}

async function listDir(url) {
  const res = await request(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const base = new URL(url);
  const basePath = norm(base.origin + base.pathname);
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
    const fullN = norm(full);
    if (!fullN.startsWith(basePath)) continue;
    if (fullN === basePath) continue;
    if (seen.has(fullN)) continue;
    seen.add(fullN);
    (full.endsWith("/") ? dirs : files).push(full);
  }
  return { dirs, files };
}

async function discoverRoots() {
  const { dirs } = await listDir(`${BASE}/`);
  const roots = [];
  const unmatched = [];
  for (const url of dirs) {
    const name = lastSegment(url);
    const rule = RULES.find((r) => r.test.test(name));
    if (rule) roots.push({ category: rule.category, type: rule.type, name, url });
    else unmatched.push(name);
  }
  return { roots, unmatched };
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

async function crawl(root, stats, seeds = [root.url], concurrency = CONCURRENCY) {
  const found = [];
  const queue = [...seeds];
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
      try {
        await visit(url);
      } catch (e) {
        stats.failed.set(url, reason(e));
        console.warn(`  ! ${norm(url)} -> ${reason(e)}`);
      } finally {
        active--;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return found;
}

async function crawlRoot(root) {
  const stats = { folders: 0, retried: 0, failed: new Map() };
  const found = await crawl(root, stats);
  for (let pass = 1; pass <= RETRY_PASSES && stats.failed.size > 0; pass++) {
    const seeds = [...stats.failed.keys()];
    stats.failed.clear();
    stats.retried += seeds.length;
    console.log(`  retry pass ${pass}/${RETRY_PASSES}: ${seeds.length} folders`);
    await sleep(3000 * pass);
    found.push(...(await crawl(root, stats, seeds, 2)));
  }
  return { found, stats };
}

function carryOver(previous, urls) {
  if (!previous?.movies || urls.length === 0) return [];
  const prefixes = urls.map(norm);
  const out = [];
  for (const m of previous.movies) {
    for (const v of m.versions || []) {
      if (!prefixes.some((p) => norm(v.path).startsWith(p))) continue;
      out.push({
        category: v.category || m.category,
        folder: v.folder,
        title: m.title,
        year: m.year,
        quality: v.quality,
        path: v.path,
        poster: v.poster,
        subtitles: v.subtitles || [],
        files: v.files,
      });
    }
  }
  return out;
}
import { writeFile, readFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

try { process.loadEnvFile(resolve(__dirname, "../web/.env")); } catch {}

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const opt = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

const WITH_SIZES = !has("no-sizes");
const WITH_TMDB = has("tmdb");
const REFRESH = has("refresh");
const FORCE = has("force");
const LIST_ROOTS = has("list-roots");
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

const RULES = [
  { test: /korean.*(tv|series)|(tv|series).*korean/i, category: "Korean", type: "series" },
  { test: /\bseries\b|\btv\b/i, category: "Series", type: "series" },
  { test: /documentar/i, category: "Documentary", type: "movie" },
  { test: /animation|cartoon|anime/i, category: "Animation", type: "movie" },
  { test: /south|tamil|telugu|malayalam|kannada/i, category: "South", type: "movie" },
  { test: /hindi|bollywood/i, category: "Hindi", type: "movie" },
  { test: /english|hollywood/i, category: "English", type: "movie" },
  { test: /korean/i, category: "Korean", type: "movie" },
];
const EXPECTED = ["Hindi", "English", "South", "Animation", "Documentary"];

const VIDEO = /\.(mkv|mp4|avi|webm|m4v)$/i;
const IMAGE = /\.(jpe?g|png|webp)$/i;
const SUB = /\.(srt|vtt)$/i;
const CONCURRENCY = 6;
const RETRY_PASSES = 3;
const RANK = { "2160p": 4, "1080p": 3, "720p": 2, "480p": 1 };

const OUT = resolve(__dirname, ONLY ? "../web/public/movies.only.json" : "../web/public/movies.json");
const REPORT = resolve(__dirname, "scan-report.json");
const CACHE = resolve(__dirname, ".scan-cache.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const lastSegment = (url) => norm(url.replace(/\/$/, "").split("/").pop() || "");
const hash = (s) => createHash("md5").update(s).digest("hex").slice(0, 10);
const reason = (e) => (e.cause?.code ? `${e.message} (${e.cause.code})` : e.message);

async function pool(items, limit, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    })
  );
}

async function request(url, init = {}, tries = 6) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      last = e;
      await sleep(Math.min(500 * 2 ** i, 8000));
    }
  }
  throw last;
}

async function listDir(url) {
  const res = await request(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const base = new URL(url);
  const basePath = norm(base.origin + base.pathname);
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
    const fullN = norm(full);
    if (!fullN.startsWith(basePath)) continue;
    if (fullN === basePath) continue;
    if (seen.has(fullN)) continue;
    seen.add(fullN);
    (full.endsWith("/") ? dirs : files).push(full);
  }
  return { dirs, files };
}

async function discoverRoots() {
  const { dirs } = await listDir(`${BASE}/`);
  const roots = [];
  const unmatched = [];
  for (const url of dirs) {
    const name = lastSegment(url);
    const rule = RULES.find((r) => r.test.test(name));
    if (rule) roots.push({ category: rule.category, type: rule.type, name, url });
    else unmatched.push(name);
  }
  return { roots, unmatched };
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

async function crawl(root, stats, seeds = [root.url], concurrency = CONCURRENCY) {
  const found = [];
  const queue = [...seeds];
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
      try {
        await visit(url);
      } catch (e) {
        stats.failed.set(url, reason(e));
        console.warn(`  ! ${norm(url)} -> ${reason(e)}`);
      } finally {
        active--;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return found;
}

async function crawlRoot(root) {
  const stats = { folders: 0, retried: 0, failed: new Map() };
  const found = await crawl(root, stats);
  for (let pass = 1; pass <= RETRY_PASSES && stats.failed.size > 0; pass++) {
    const seeds = [...stats.failed.keys()];
    stats.failed.clear();
    stats.retried += seeds.length;
    console.log(`  retry pass ${pass}/${RETRY_PASSES}: ${seeds.length} folders`);
    await sleep(3000 * pass);
    found.push(...(await crawl(root, stats, seeds, 2)));
  }
  return { found, stats };
}

function carryOver(previous, urls) {
  if (!previous?.movies || urls.length === 0) return [];
  const prefixes = urls.map(norm);
  const out = [];
  for (const m of previous.movies) {
    for (const v of m.versions || []) {
      if (!prefixes.some((p) => norm(v.path).startsWith(p))) continue;
      out.push({
        category: v.category || m.category,
        folder: v.folder,
        title: m.title,
        year: m.year,
        quality: v.quality,
        path: v.path,
        poster: v.poster,
        subtitles: v.subtitles || [],
        files: v.files,
      });
    }
  }
  return out;
}

// ---- CHANGED: audio language + version label helpers ----------------------

const LANG_CODES = {
  hindi: "hin", telugu: "tel", tamil: "tam", malayalam: "mal",
  kannada: "kan", bengali: "ben", bangla: "ben", english: "eng", urdu: "urd",
};
const LANG_NAMES = {
  hin: "Hindi", tel: "Telugu", tam: "Tamil", mal: "Malayalam",
  kan: "Kannada", ben: "Bengali", eng: "English", urd: "Urdu",
};

function fileName(url) {
  const last = String(url || "").split("/").pop() || "";
  try { return decodeURIComponent(last); } catch { return last; }
}

function versionInfo(e) {
  const name = fileName(e.files?.[0]?.url);
  const audioLangs = [];
  for (const [word, code] of Object.entries(LANG_CODES)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(name) && !audioLangs.includes(code)) {
      audioLangs.push(code);
    }
  }
  const source = name.match(/\b(BluRay|BRRip|WEB-?DL|WEBRip|HDRip|DVDRip)\b/i)?.[1] || null;
  const uncut = /\bUNCUT\b/i.test(name) ? "Uncut" : null;
  const audioText =
    audioLangs.length > 0
      ? audioLangs.map((c) => LANG_NAMES[c]).join(" + ")
      : /dual audio/i.test(name) ? "Dual Audio" : null;

  const label = [e.quality, source, audioText, uncut].filter(Boolean).join(" · ") || "HD";
  return { audioLangs, label };
}

// ---- CHANGED: groupMovies ------------------------------------------------

function groupMovies(entries) {
  const groups = new Map();
  let duplicates = 0;

  for (const e of entries) {
    const key = `${e.title.toLowerCase()}|${e.year}`;
    if (!groups.has(key)) groups.set(key, { key, title: e.title, year: e.year, versions: [] });
    const g = groups.get(key);
    // Dupe = same folder only. Same quality but different language is a separate version.
    if (g.versions.some((v) => v.path === e.path)) { duplicates++; continue; }
    g.versions.push({ ...e, ...versionInfo(e) });
  }

  const movies = [...groups.values()].map((g) => {
    // More audio languages first (Dual Audio), then higher quality.
    const versions = g.versions.sort(
      (a, b) =>
        b.audioLangs.length - a.audioLangs.length ||
        (RANK[b.quality] || 0) - (RANK[a.quality] || 0)
    );
    const primary = versions[0];
    return {
      id: hash(g.key),
      category: primary.category,
      title: g.title,
      year: g.year,
      tmdbId: null,
      quality: primary.quality,
      folder: primary.folder,
      path: primary.path,
      video: primary.files[0].url,
      videos: primary.files.map((f) => f.url),
      subtitles: primary.subtitles,
      poster: versions.find((v) => v.poster)?.poster || null,
      size: null,
      modified: null,
      qualities: [...new Set(versions.map((v) => v.quality).filter(Boolean))],
      audioLangs: [...new Set(versions.flatMap((v) => v.audioLangs))],
      versions: versions.map((v) => ({
        quality: v.quality,
        label: v.label,
        audioLangs: v.audioLangs,
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

// --------------------------------------------------------------------------

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
      failed++;
    }
    if (++done % 500 === 0) console.log(`  ${done}/${todo.length}`);
  });

  for (const f of files) {
    const c = cache.sizes[f.url];
    if (c) { f.size = c.size; f.modified = c.modified; }
  }
  for (const m of movies) {
    for (const v of m.versions) {
      v.size = v.files.every((f) => f.size) ? v.files.reduce((s, f) => s + f.size, 0) : null;
    }
    const p = m.versions[0];
    m.size = p.size;
    m.modified = p.files.map((f) => f.modified).filter(Boolean).sort().pop() || null;
  }
  return { total: files.length, withSize: files.filter((f) => f.size).length, failed };
}

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
      return y && Math.abs(y - year) <= 1;
    });
  return (pick(await search(true)) || pick(await search(false)))?.id ?? null;
}

async function fillTmdb(movies, cache) {
  const todo = REFRESH ? movies : movies.filter((m) => !(m.id in cache.tmdb));
  console.log(`TMDB: ${movies.length} movies, ${todo.length} to look up`);

  let done = 0;
  let ok = 0;
  let failed = 0;
  let firstError = null;
  let stopped = false;

  await pool(todo, 5, async (m) => {
    if (stopped) return;
    try {
      cache.tmdb[m.id] = await lookupTmdb(m.title, m.year);
      ok++;
    } catch (e) {
      failed++;
      firstError ||= reason(e);
      if (ok === 0 && failed >= 20) {
        stopped = true;
        console.error(`\nTMDB lookup is failing: ${firstError}`);
        console.error("Check TMDB_TOKEN (the long Read Access Token) and that api.themoviedb.org opens from this PC.");
      }
    }
    if (++done % 200 === 0) console.log(`  ${done}/${todo.length}`);
  });

  for (const m of movies) m.tmdbId = cache.tmdb[m.id] ?? null;
  return { matched: movies.filter((m) => m.tmdbId).length, failed, stopped, firstError };
}

async function loadJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; }
}

async function main() {
  const { roots, unmatched } = await discoverRoots();

  if (LIST_ROOTS) {
    console.log("Detected roots:");
    for (const r of roots) console.log(`  [${r.type}] ${r.category.padEnd(12)} ${r.name}`);
    console.log("Ignored folders (no rule matched):");
    for (const n of unmatched) console.log(`  ${n}`);
    return;
  }

  if (!roots.some((r) => r.type === "movie")) {
    console.error(`No movie folders detected under ${BASE}/. Run: node scan.js --list-roots`);
    process.exit(1);
  }

  const previous = await loadJson(OUT, null);
  const cache = await loadJson(CACHE, { sizes: {}, tmdb: {} });
  cache.sizes ||= {};
  cache.tmdb ||= {};

  const entries = [];
  const rootReports = [];
  const unresolved = [];
  let carriedTotal = 0;

  for (const root of roots) {
    if (ONLY && root.category.toLowerCase() !== ONLY.toLowerCase()) continue;
    if (root.type === "series") {
      console.log(`Skipping ${root.name} (series, handled by the series scanner)`);
      rootReports.push({ ...root, skipped: true });
      continue;
    }
    console.log(`Scanning ${root.category}: ${root.name}`);
    const { found, stats } = await crawlRoot(root);
    const failedUrls = [...stats.failed.keys()];
    const carried = carryOver(previous, failedUrls);
    entries.push(...found, ...carried);
    carriedTotal += carried.length;
    for (const [url, error] of stats.failed) unresolved.push({ root: root.name, url, error });
    rootReports.push({
      category: root.category,
      type: root.type,
      name: root.name,
      url: root.url,
      folders: stats.folders,
      versionsFound: found.length,
      retried: stats.retried,
      unresolved: failedUrls.length,
      carriedOver: carried.length,
      firstError: failedUrls.length ? stats.failed.get(failedUrls[0]) : null,
    });
    console.log(`  ${found.length} versions in ${stats.folders} folders, ${failedUrls.length} unresolved, ${carried.length} carried over`);
    if (found.length === 0 && carried.length === 0) console.warn(`  ! ${root.name}: nothing found`);
  }

  const { movies, duplicates } = groupMovies(entries);

  const sizeInfo = WITH_SIZES ? await fillSizes(movies, cache) : null;
  if (WITH_SIZES) await writeFile(CACHE, JSON.stringify(cache));
  const tmdbInfo = WITH_TMDB ? await fillTmdb(movies, cache) : null;
  if (WITH_TMDB) await writeFile(CACHE, JSON.stringify(cache));

  const categoryCounts = {};
  for (const m of movies) categoryCounts[m.category] = (categoryCounts[m.category] || 0) + 1;
  const missingCategories = ONLY ? [] : EXPECTED.filter((c) => !categoryCounts[c]);

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
  await rename(tmp, OUT);

  const report = {
    generatedAt: new Date().toISOString(),
    complete: unresolved.length === 0,
    movies: movies.length,
    versions: entries.length - duplicates,
    duplicatesSkipped: duplicates,
    carriedOver: carriedTotal,
    categoryCounts,
    missingCategories,
    ignoredFolders: unmatched,
    unresolved,
    roots: rootReports,
    sizes: sizeInfo,
    tmdb: tmdbInfo,
  };
  await writeFile(REPORT, JSON.stringify(report, null, 2));

  console.log(`\nDone. ${movies.length} movies (${report.versions} quality versions) -> ${OUT}`);
  console.log("Per category:", categoryCounts);
  if (missingCategories.length) console.warn(`MISSING categories (0 movies): ${missingCategories.join(", ")}`);
  if (unmatched.length) console.warn(`Ignored folders: ${unmatched.join(", ")}`);
  if (unresolved.length) {
    console.warn(`INCOMPLETE: ${unresolved.length} folders could not be read, ${carriedTotal} versions kept from the previous scan.`);
    process.exitCode = 2;
  }
  if (sizeInfo) console.log(`Sizes: ${sizeInfo.withSize}/${sizeInfo.total} files, ${sizeInfo.failed} failed`);
  if (tmdbInfo) console.log(`TMDB: ${tmdbInfo.matched}/${movies.length} matched, ${tmdbInfo.failed} failed`);
  console.log(`Report -> ${REPORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
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
      id: hash(g.key),
      category: primary.category,
      title: g.title,
      year: g.year,
      tmdbId: null,
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
      failed++;
    }
    if (++done % 500 === 0) console.log(`  ${done}/${todo.length}`);
  });

  for (const f of files) {
    const c = cache.sizes[f.url];
    if (c) { f.size = c.size; f.modified = c.modified; }
  }
  for (const m of movies) {
    for (const v of m.versions) {
      v.size = v.files.every((f) => f.size) ? v.files.reduce((s, f) => s + f.size, 0) : null;
    }
    const p = m.versions[0];
    m.size = p.size;
    m.modified = p.files.map((f) => f.modified).filter(Boolean).sort().pop() || null;
  }
  return { total: files.length, withSize: files.filter((f) => f.size).length, failed };
}

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
      return y && Math.abs(y - year) <= 1;
    });
  return (pick(await search(true)) || pick(await search(false)))?.id ?? null;
}

async function fillTmdb(movies, cache) {
  const todo = REFRESH ? movies : movies.filter((m) => !(m.id in cache.tmdb));
  console.log(`TMDB: ${movies.length} movies, ${todo.length} to look up`);

  let done = 0;
  let ok = 0;
  let failed = 0;
  let firstError = null;
  let stopped = false;

  await pool(todo, 5, async (m) => {
    if (stopped) return;
    try {
      cache.tmdb[m.id] = await lookupTmdb(m.title, m.year);
      ok++;
    } catch (e) {
      failed++;
      firstError ||= reason(e);
      if (ok === 0 && failed >= 20) {
        stopped = true;
        console.error(`\nTMDB lookup is failing: ${firstError}`);
        console.error("Check TMDB_TOKEN (the long Read Access Token) and that api.themoviedb.org opens from this PC.");
      }
    }
    if (++done % 200 === 0) console.log(`  ${done}/${todo.length}`);
  });

  for (const m of movies) m.tmdbId = cache.tmdb[m.id] ?? null;
  return { matched: movies.filter((m) => m.tmdbId).length, failed, stopped, firstError };
}

async function loadJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; }
}

async function main() {
  const { roots, unmatched } = await discoverRoots();

  if (LIST_ROOTS) {
    console.log("Detected roots:");
    for (const r of roots) console.log(`  [${r.type}] ${r.category.padEnd(12)} ${r.name}`);
    console.log("Ignored folders (no rule matched):");
    for (const n of unmatched) console.log(`  ${n}`);
    return;
  }

  if (!roots.some((r) => r.type === "movie")) {
    console.error(`No movie folders detected under ${BASE}/. Run: node scan.js --list-roots`);
    process.exit(1);
  }

  const previous = await loadJson(OUT, null);
  const cache = await loadJson(CACHE, { sizes: {}, tmdb: {} });
  cache.sizes ||= {};
  cache.tmdb ||= {};

  const entries = [];
  const rootReports = [];
  const unresolved = [];
  let carriedTotal = 0;

  for (const root of roots) {
    if (ONLY && root.category.toLowerCase() !== ONLY.toLowerCase()) continue;
    if (root.type === "series") {
      console.log(`Skipping ${root.name} (series, handled by the series scanner)`);
      rootReports.push({ ...root, skipped: true });
      continue;
    }
    console.log(`Scanning ${root.category}: ${root.name}`);
    const { found, stats } = await crawlRoot(root);
    const failedUrls = [...stats.failed.keys()];
    const carried = carryOver(previous, failedUrls);
    entries.push(...found, ...carried);
    carriedTotal += carried.length;
    for (const [url, error] of stats.failed) unresolved.push({ root: root.name, url, error });
    rootReports.push({
      category: root.category,
      type: root.type,
      name: root.name,
      url: root.url,
      folders: stats.folders,
      versionsFound: found.length,
      retried: stats.retried,
      unresolved: failedUrls.length,
      carriedOver: carried.length,
      firstError: failedUrls.length ? stats.failed.get(failedUrls[0]) : null,
    });
    console.log(`  ${found.length} versions in ${stats.folders} folders, ${failedUrls.length} unresolved, ${carried.length} carried over`);
    if (found.length === 0 && carried.length === 0) console.warn(`  ! ${root.name}: nothing found`);
  }

  const { movies, duplicates } = groupMovies(entries);

  const sizeInfo = WITH_SIZES ? await fillSizes(movies, cache) : null;
  if (WITH_SIZES) await writeFile(CACHE, JSON.stringify(cache));
  const tmdbInfo = WITH_TMDB ? await fillTmdb(movies, cache) : null;
  if (WITH_TMDB) await writeFile(CACHE, JSON.stringify(cache));

  const categoryCounts = {};
  for (const m of movies) categoryCounts[m.category] = (categoryCounts[m.category] || 0) + 1;
  const missingCategories = ONLY ? [] : EXPECTED.filter((c) => !categoryCounts[c]);

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
  await rename(tmp, OUT);

  const report = {
    generatedAt: new Date().toISOString(),
    complete: unresolved.length === 0,
    movies: movies.length,
    versions: entries.length - duplicates,
    duplicatesSkipped: duplicates,
    carriedOver: carriedTotal,
    categoryCounts,
    missingCategories,
    ignoredFolders: unmatched,
    unresolved,
    roots: rootReports,
    sizes: sizeInfo,
    tmdb: tmdbInfo,
  };
  await writeFile(REPORT, JSON.stringify(report, null, 2));

  console.log(`\nDone. ${movies.length} movies (${report.versions} quality versions) -> ${OUT}`);
  console.log("Per category:", categoryCounts);
  if (missingCategories.length) console.warn(`MISSING categories (0 movies): ${missingCategories.join(", ")}`);
  if (unmatched.length) console.warn(`Ignored folders: ${unmatched.join(", ")}`);
  if (unresolved.length) {
    console.warn(`INCOMPLETE: ${unresolved.length} folders could not be read, ${carriedTotal} versions kept from the previous scan.`);
    process.exitCode = 2;
  }
  if (sizeInfo) console.log(`Sizes: ${sizeInfo.withSize}/${sizeInfo.total} files, ${sizeInfo.failed} failed`);
  if (tmdbInfo) console.log(`TMDB: ${tmdbInfo.matched}/${movies.length} matched, ${tmdbInfo.failed} failed`);
  console.log(`Report -> ${REPORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});