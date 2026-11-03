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
  store = {
    mtimeMs,
    movies,
    byId: new Map(movies.map((m) => [m.id, m])),
    categories: [...new Set(movies.map((m) => m.category))],
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
  if (cmp) list = [...list].sort(cmp);

  if (tokens.length) {
    const q = tokens.join(" ");
    list = [...list].sort(
      (a, b) => Number(b._search.startsWith(q)) - Number(a._search.startsWith(q))
    );
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