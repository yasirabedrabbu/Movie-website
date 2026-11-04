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
const LIST_ROOTS = has("list-roots");
const FORCE = has("force");
const ONLY = opt("only")?.toLowerCase();

const BASE = (process.env.MEDIA_BASE_URL || "").replace(/\/+$/, "");
if (!BASE) {
  console.error("MEDIA_BASE_URL is not set in web/.env");
  process.exit(1);
}
if (WITH_TMDB && !process.env.TMDB_TOKEN) {
  console.error("--tmdb needs TMDB_TOKEN in web/.env");
  process.exit(1);
}

const TMDB_API = "https://api.themoviedb.org/3";
const SERIES_ROOT = /\btv\b|\bseries\b/i;
const VIDEO = /\.(mkv|mp4|avi|webm|m4v)$/i;
const IMAGE = /\.(jpe?g|png|webp)$/i;
const SUB = /\.(srt|vtt)$/i;
const CONCURRENCY = 6;
const RANK = { "2160p": 4, "1080p": 3, "720p": 2, "480p": 1 };

const OUT = resolve(__dirname, "../web/public/series.json");
const CACHE = resolve(__dirname, ".series-cache.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const lastSegment = (url) => norm(url.replace(/\/$/, "").split("/").pop() || "");
const hash = (s) => createHash("md5").update(s).digest("hex").slice(0, 10);
const reason = (e) => (e.cause?.code ? `${e.message} (${e.cause.code})` : e.message);
const epKey = (s, e) => `${s}x${e}`;

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
    if (!fullN.startsWith(basePath) || fullN === basePath) continue;
    if (seen.has(fullN)) continue;
    seen.add(fullN);
    (full.endsWith("/") ? dirs : files).push(full);
  }
  return { dirs, files };
}

// ---------- parsing ----------

function parseQuality(text) {
  const m = text?.match(/(2160p|1080p|720p|480p|4k)/i);
  if (!m) return null;
  return m[1].toLowerCase() === "4k" ? "2160p" : m[1].toLowerCase();
}

// "Squid Game (TV Series 2021–2025) 1080p [Multi Audio]" -> { title: "Squid Game", year: 2021 }
function parseShow(folder) {
  const year = Number(folder.match(/\(TV[^)]*?(\d{4})/i)?.[1]) || null;
  const title = folder
    .replace(/\s*\[[^\]]*\]/g, "")
    .replace(/\s*\((?:TV|Mini)[^)]*\)/gi, "")
    .replace(/\s*\b(2160p|1080p|720p|480p|4k)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return { title: title || folder, year };
}

// "Season 1 (Korean Language)" -> 1, "Specials" -> 0, anything else -> null
function seasonFromFolder(name) {
  if (/special/i.test(name)) return 0;
  const m = name.match(/season\s*0*(\d+)/i);
  return m ? Number(m[1]) : null;
}

// Returns a list of { season, episode } so one file can cover several episodes.
//   "Come & Hug Me E01–E02 ..."   -> [ep 1, ep 2]
//   "Squid Game S01E08 ..."       -> [S1 ep 8]
//   "Dong.Yi.E01.KOR ..."         -> [ep 1]
//   "Personal.Taste.01.KOR ..."   -> [ep 1]
//   "Show 1x05 ..."               -> [S1 ep 5]
//   "Show Episode 7 ..."          -> [ep 7]
function parseEpisodes(name) {
  // Range: E01–E02, S01E01-E02, E01-02
  const range = name.match(/(?:^|[^a-z0-9])(?:S(\d{1,2}))?E(\d{1,4})\s*[–—-]\s*E?(\d{1,4})(?![a-z0-9])/i);
  if (range) {
    const from = Number(range[2]);
    const to = Number(range[3]);
    if (to >= from && to - from < 20) {
      const season = range[1] ? Number(range[1]) : null;
      return Array.from({ length: to - from + 1 }, (_, i) => ({ season, episode: from + i }));
    }
  }

  const full = name.match(/S(\d{1,2})[._ -]?E(\d{1,4})(?![a-z0-9])/i);
  if (full) return [{ season: Number(full[1]), episode: Number(full[2]) }];

  const short = name.match(/(?:^|[^a-z0-9])E(\d{1,4})(?![a-z0-9])/i);
  if (short) return [{ season: null, episode: Number(short[1]) }];

  const x = name.match(/(?:^|[^a-z0-9])(\d{1,2})x(\d{1,4})(?![a-z0-9])/i);
  if (x) return [{ season: Number(x[1]), episode: Number(x[2]) }];

  const ep = name.match(/episode[\s._-]*(\d{1,4})(?![a-z0-9])/i);
  if (ep) return [{ season: null, episode: Number(ep[1]) }];

  // Dotted/spaced number after the show name: "Personal.Taste.01.KOR"
  // Skip years (1900-2099) and resolution-like tokens, and skip the first token
  // so a leading number in the show title (e.g. "100 Days") is not used.
  const tokens = name.split(/[._\s]+/);
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (!/^\d{1,3}$/.test(t)) continue;
    const n = Number(t);
    if (n > 0) return [{ season: null, episode: n }];
  }

  return [];
}

function findMissing(eps) {
  const have = new Set(eps.map((e) => e.number));
  const max = Math.max(0, ...have);
  const out = [];
  for (let i = 1; i <= max; i++) if (!have.has(i)) out.push(i);
  return out;
}

// ---------- scanning ----------

async function scanShow(show) {
  const top = await listDir(show.url);
  const images = top.files.filter((f) => IMAGE.test(f));
  const poster = images.find((f) => /_AL_/.test(f)) || images[0] || null;

  // Show-root files first, then each sub-folder.
  const sources = [{ listing: top, folderName: null, dirNumber: null }];
  for (const dir of top.dirs) {
    const name = lastSegment(dir);
    sources.push({
      listing: await listDir(dir),
      folderName: name,
      dirNumber: seasonFromFolder(name),
    });
  }

  // If the show has no season folders, its loose files are season 1.
  const hasSeasonFolders = top.dirs.some((d) => seasonFromFolder(lastSegment(d)) !== null);
  const fallbackSeason = hasSeasonFolders ? null : 1;

  const episodes = new Map();
  const subs = new Map();
  const unsorted = [];

  for (const src of sources) {
    for (const url of src.listing.files) {
      const name = lastSegment(url);

      if (VIDEO.test(name)) {
        const parsed = parseEpisodes(name);
        if (!parsed.length) {
          unsorted.push(name);
          continue;
        }
        for (const ep of parsed) {
          const season = src.dirNumber ?? ep.season ?? fallbackSeason;
          if (season === null) {
            unsorted.push(name);
            continue;
          }
          const key = epKey(season, ep.episode);
          if (!episodes.has(key)) episodes.set(key, { season, number: ep.episode, files: [] });
          episodes.get(key).files.push({
            url,
            name,
            ext: name.split(".").pop().toLowerCase(),
            quality: parseQuality(name),
          });
        }
      } else if (SUB.test(name)) {
        const parsed = parseEpisodes(name);
        if (!parsed.length) continue;
        for (const ep of parsed) {
          const season = src.dirNumber ?? ep.season ?? fallbackSeason;
          if (season === null) continue;
          const key = epKey(season, ep.episode);
          if (!subs.has(key)) subs.set(key, []);
          subs.get(key).push(url);
        }
      }
    }
  }

  const bySeason = new Map();
  for (const ep of episodes.values()) {
    ep.files.sort((a, b) => (RANK[b.quality] || 0) - (RANK[a.quality] || 0));
    if (!bySeason.has(ep.season)) bySeason.set(ep.season, []);
    bySeason.get(ep.season).push(ep);
  }

  const folderNames = new Map(
    sources.filter((s) => s.dirNumber !== null).map((s) => [s.dirNumber, s.folderName])
  );

  const build = (number, eps) => {
    eps.sort((a, b) => a.number - b.number);
    return {
      number,
      label: number === 0 ? "Specials" : `Season ${number}`,
      folder: folderNames.get(number) ?? null,
      episodes: eps.map((ep) => ({
        season: ep.season,
        number: ep.number,
        files: ep.files.map(({ url, name, ext, quality }) => ({
          url, name, ext, quality, size: null, modified: null,
        })),
        subtitles: subs.get(epKey(ep.season, ep.number)) || [],
      })),
      missing: number === 0 ? [] : findMissing(eps),
    };
  };

  const seasons = [];
  let specials = null;
  for (const [number, eps] of [...bySeason].sort((a, b) => a[0] - b[0])) {
    const season = build(number, eps);
    if (number === 0) specials = season;
    else seasons.push(season);
  }

  const { title, year } = parseShow(show.folder);
  const episodeCount =
    seasons.reduce((n, s) => n + s.episodes.length, 0) + (specials?.episodes.length || 0);

  return {
    id: hash(show.url),
    title,
    year,
    category: show.category,
    quality: parseQuality(show.folder),
    folder: show.folder,
    path: show.url,
    poster,
    seasonCount: seasons.length,
    episodeCount,
    missingCount: seasons.reduce((n, s) => n + s.missing.length, 0),
    seasons,
    specials,
    unsorted,
    tmdbId: null,
  };
}

// ---------- enrichment ----------

function allFiles(list) {
  return list
    .flatMap((s) => [...s.seasons, ...(s.specials ? [s.specials] : [])])
    .flatMap((season) => season.episodes.flatMap((e) => e.files));
}

async function fillSizes(list, cache) {
  const files = allFiles(list);
  const todo = files.filter((f) => !(f.url in cache.sizes));
  console.log(`Sizes: ${files.length} files, ${todo.length} to fetch`);

  await pool(todo, CONCURRENCY, async (f) => {
    try {
      const res = await request(f.url, { method: "HEAD" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const len = Number(res.headers.get("content-length"));
      const lm = res.headers.get("last-modified");
      cache.sizes[f.url] = {
        size: len > 0 ? len : null,
        modified: lm && !Number.isNaN(Date.parse(lm)) ? new Date(lm).toISOString() : null,
      };
    } catch {}
  });

  for (const f of files) {
    const c = cache.sizes[f.url];
    if (c) { f.size = c.size; f.modified = c.modified; }
  }
}

async function lookupTmdb(title, year) {
  const search = async (withYear) => {
    const qs = new URLSearchParams({ query: title });
    if (withYear && year) qs.set("first_air_date_year", String(year));
    const res = await request(`${TMDB_API}/search/tv?${qs}`, {
      headers: { Authorization: `Bearer ${process.env.TMDB_TOKEN}`, accept: "application/json" },
    });
    if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
    return (await res.json()).results || [];
  };
  const pick = (rs) =>
    rs.find((r) => {
      if (!year) return true;
      const y = Number(r.first_air_date?.slice(0, 4));
      return y && Math.abs(y - year) <= 1;
    });
  return (pick(await search(true)) || pick(await search(false)))?.id ?? null;
}

async function fillTmdb(list, cache) {
  const todo = list.filter((s) => !(s.id in cache.tmdb));
  console.log(`TMDB: ${list.length} series, ${todo.length} to look up`);
  await pool(todo, 5, async (s) => {
    try {
      cache.tmdb[s.id] = await lookupTmdb(s.title, s.year);
    } catch (e) {
      console.warn(`  ! TMDB ${s.title}: ${reason(e)}`);
    }
  });
  for (const s of list) s.tmdbId = cache.tmdb[s.id] ?? null;
}

async function loadJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; }
}

// ---------- main ----------

async function main() {
  const top = await listDir(`${BASE}/`);
  const roots = top.dirs
    .filter((d) => SERIES_ROOT.test(lastSegment(d)))
    .map((url) => ({ url, name: lastSegment(url) }));

  if (LIST_ROOTS) {
    console.log("Series roots:");
    for (const r of roots) console.log(`  ${r.name}`);
    return;
  }
  if (!roots.length) {
    console.error("No series root found (folder name must contain 'TV' or 'Series'). Run --list-roots.");
    process.exit(1);
  }

  const shows = [];
  for (const root of roots) {
    const category = /korean/i.test(root.name) ? "Korean" : root.name;
    const { dirs } = await listDir(root.url);
    for (const url of dirs) {
      const folder = lastSegment(url);
      if (ONLY && !folder.toLowerCase().includes(ONLY)) continue;
      shows.push({ url, folder, category });
    }
  }
  console.log(`Found ${shows.length} shows${ONLY ? ` matching "${ONLY}"` : ""}`);

  const previous = await loadJson(OUT, null);
  const cache = await loadJson(CACHE, { sizes: {}, tmdb: {} });
  cache.sizes ||= {};
  cache.tmdb ||= {};

  const list = [];
  const failed = [];
  let done = 0;
  await pool(shows, CONCURRENCY, async (show) => {
    try {
      list.push(await scanShow(show));
    } catch (e) {
      failed.push(show.folder);
      console.warn(`  ! ${show.folder}: ${reason(e)}`);
    }
    if (++done % 25 === 0) console.log(`  scanned ${done}/${shows.length}`);
  });

  // Keep the last good entry for shows that could not be read this run.
  for (const folder of failed) {
    const old = previous?.series?.find((s) => s.folder === folder);
    if (old) list.push(old);
  }

  list.sort((a, b) => a.title.localeCompare(b.title));

  if (WITH_SIZES) {
    await fillSizes(list, cache);
    await writeFile(CACHE, JSON.stringify(cache));
  }
  if (WITH_TMDB) {
    await fillTmdb(list, cache);
    await writeFile(CACHE, JSON.stringify(cache));
  }

  if (!FORCE && !ONLY && previous?.count && list.length < previous.count * 0.5) {
    console.error(
      `\nAborted: found ${list.length} series, current file has ${previous.count}. ` +
        `Check the server, or re-run with --force.`
    );
    process.exit(1);
  }

  await mkdir(dirname(OUT), { recursive: true });
  const tmp = `${OUT}.tmp`;
  await writeFile(
    tmp,
    JSON.stringify({ generatedAt: new Date().toISOString(), count: list.length, series: list }, null, 2)
  );
  await rename(tmp, OUT);

  console.log(`\nDone. ${list.length} series -> ${OUT}`);
  for (const s of list) {
    if (s.missingCount || s.unsorted.length) {
      console.log(`  ${s.title}: ${s.missingCount} missing, ${s.unsorted.length} unsorted`);
    }
  }
  if (failed.length) {
    console.warn(`INCOMPLETE: ${failed.length} shows could not be read.`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});