import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { PAGE_SIZE } from "./constants";

const FILE = path.join(process.cwd(), "public", "movies.json");
const MAX_PAGE_SIZE = 100;

const normalize = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const SORTS = {
  title: (a, b) => a.title.localeCompare(b.title),
  year: (a, b) => (b.year || 0) - (a.year || 0),
  new: (a, b) =>
    (b.modified || "").localeCompare(a.modified || "") || (b.year || 0) - (a.year || 0),
};

let store = null;

async function load() {
  const { mtimeMs } = await stat(FILE);
  if (store?.mtimeMs === mtimeMs) return store;
  const data = JSON.parse(await readFile(FILE, "utf8"));
  const movies = data.movies.map((m) => ({ ...m, _search: normalize(m.title) }));
  const byNew = (a, b) =>
  (b.modified || "").localeCompare(a.modified || "") || (b.year || 0) - (a.year || 0);

// ...load() er vitore:
  store = {
    mtimeMs,
    movies,
    byId: new Map(movies.map((m) => [m.id, m])),
    categories: [...new Set(movies.map((m) => m.category))],
    newest: [...movies].sort(byNew), // ekbar sort, tarpor cache
  };
  return store;
}

function toCard(m) {
  return {
    id: m.id,
    title: m.title,
    year: m.year,
    quality: m.quality,
    poster: m.poster,
    category: m.category,
    tmdbId: m.tmdbId ?? null,
  };
}

export async function listMovies({
  category = "All",
  query = "",
  page = 1,
  pageSize = PAGE_SIZE,
  sort = "default",
} = {}) {
  const { movies } = await load();
  const tokens = normalize(query).split(" ").filter(Boolean);
  const p = Math.max(1, Math.floor(Number(page)) || 1);
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(pageSize)) || PAGE_SIZE));

  let list = movies;
  if (category !== "All") list = list.filter((m) => m.category === category);
  if (tokens.length) list = list.filter((m) => tokens.every((t) => m._search.includes(t)));

  const cmp = SORTS[sort];

  if (tokens.length) {
    const q = tokens.join(" ");
    const starts = (m) => Number(m._search.startsWith(q));
    list = [...list].sort((a, b) => {
      const byStart = starts(b) - starts(a);
      if (byStart !== 0) return byStart;
      return cmp ? cmp(a, b) : 0;
    });
  } else if (cmp) {
    list = [...list].sort(cmp);
  }

  const start = (p - 1) * size;
  return {
    total: list.length,
    page: p,
    pageSize: size,
    hasMore: start + size < list.length,
    movies: list.slice(start, start + size).map(toCard),
  };
}

export async function findMovie(id) {
  const { byId } = await load();
  const movie = byId.get(id);
  if (!movie) return null;
  const { _search, ...rest } = movie;
  return rest;
}

export async function getCategories() {
  const { categories } = await load();
  return categories;
}
import { slugify } from "./format";

export async function getHomeRows(perRow = 20) {
  const { newest, categories } = await load();

  const recent = newest.slice(0, perRow).map(toCard);
  const byCat = new Map(categories.map((c) => [c, []]));

  // Ek loop e sob category er newest movie gulo jog kori.
  for (const m of newest) {
    const list = byCat.get(m.category);
    if (list && list.length < perRow) list.push(toCard(m));
  }

  const rows = [{ id: "recent", title: "Recently added", movies: recent }];
  for (const c of categories) {
    rows.push({ id: slugify(c), title: c, movies: byCat.get(c) });
  }
  return rows.filter((r) => r.movies.length > 0);
}