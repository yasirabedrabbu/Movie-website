import { cacheLife } from "next/cache";
import { config, hasTmdb, tmdbImage } from "./config";

// ---------------------------------------------------------------------------
// Low level
// ---------------------------------------------------------------------------

// Cached raw request.
//
// BUG FIX: the old code returned `null` on every failure inside a "use cache"
// function, so one rate-limit / network blip / missing token was cached for
// days. Now only real answers are cached:
//   - 200 -> JSON is cached
//   - 404 -> null is cached (the thing genuinely does not exist)
//   - anything else THROWS. Thrown errors are not cached.
async function tmdbRaw(pathWithQuery) {
  "use cache";
  cacheLife("days");

  const res = await fetch(`${config.tmdb.apiBase}${pathWithQuery}`, {
    headers: {
      Authorization: `Bearer ${config.tmdb.token}`,
      accept: "application/json",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TMDB ${res.status} ${pathWithQuery}`);
  return res.json();
}

// Not cached itself: it swallows errors so pages still render without TMDB,
// while tmdbRaw above stays free of cached failures.
async function tmdb(path, params = {}) {
  if (!hasTmdb) return null;
  const qs = new URLSearchParams({ language: config.tmdb.language, ...params });
  try {
    return await tmdbRaw(`${path}?${qs}`);
  } catch (err) {
    console.warn(`[tmdb] ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function releaseYear(result) {
  const y = Number(result?.release_date?.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : null;
}

// Accept a hit only if its year is within 1 of ours. Folder years and TMDB
// release years often differ by one, but a 5-year gap is a different movie.
function pickMatch(results = [], year) {
  return results.find((r) => {
    if (!year) return true;
    const y = releaseYear(r);
    return y !== null && Math.abs(y - year) <= 1;
  });
}

function pickTrailer(videos = []) {
  const yt = videos.filter((v) => v.site === "YouTube");
  return (
    yt.find((v) => v.type === "Trailer" && v.official) ||
    yt.find((v) => v.type === "Trailer") ||
    yt.find((v) => v.type === "Teaser") ||
    null
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Title + year -> TMDB id. Prefer storing `tmdbId` in movies.json (scanner
// --tmdb) and passing it to getMovieMedia, so this search is only a fallback.
export async function findTmdbId(title, year) {
  const query = { query: title };
  const withYear = year ? await tmdb("/search/movie", { ...query, year }) : null;
  const hit =
    pickMatch(withYear?.results, year) ||
    pickMatch((await tmdb("/search/movie", query))?.results, year);
  return hit?.id ?? null;
}

// Everything the hero carousel / movie header needs, in one call.
// Backward compatible: getMovieMedia(title, year) still works.
export async function getMovieMedia(title, year, tmdbId = null) {
  const id = tmdbId ?? (await findTmdbId(title, year));
  if (!id) return null;

  const m = await tmdb(`/movie/${id}`, {
    append_to_response: "videos",
    include_video_language: "en,null",
  });
  if (!m) return null;

  return {
    tmdbId: m.id,
    title: m.title,
    tagline: m.tagline || "",
    overview: m.overview || "",
    rating: m.vote_average || null,
    voteCount: m.vote_count || 0,
    runtime: m.runtime || null,
    genres: (m.genres || []).map((g) => g.name),
    releaseDate: m.release_date || null,
    backdrop: tmdbImage(m.backdrop_path, "w1280"),
    poster: tmdbImage(m.poster_path, "w500"),
    trailerKey: pickTrailer(m.videos?.results)?.key || null,
  };
}

function mapPerson(p, extra = {}) {
  return {
    id: p.id,
    name: p.name,
    photo: tmdbImage(p.profile_path, "w185"),
    ...extra,
  };
}

const CREW_JOBS = [
  "Director",
  "Screenplay",
  "Writer",
  "Story",
  "Producer",
  "Original Music Composer",
  "Director of Photography",
  "Editor",
];

export async function getMovieDetails(tmdbId) {
  if (!tmdbId) return null;

  const m = await tmdb(`/movie/${tmdbId}`, {
    append_to_response: "videos,credits,similar,external_ids",
    include_video_language: "en,null",
  });
  if (!m) return null;

  const seen = new Set();
  const crew = (m.credits?.crew || [])
    .filter((c) => CREW_JOBS.includes(c.job))
    .filter((c) => {
      const key = `${c.id}|${c.job}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => CREW_JOBS.indexOf(a.job) - CREW_JOBS.indexOf(b.job))
    .slice(0, 14)
    .map((c) => mapPerson(c, { job: c.job }));

  return {
    tmdbId: m.id,
    imdbId: m.external_ids?.imdb_id || m.imdb_id || null,
    title: m.title,
    originalTitle: m.original_title || null,
    tagline: m.tagline || "",
    overview: m.overview || "",
    status: m.status || null,
    rating: m.vote_average || null,
    voteCount: m.vote_count || 0,
    runtime: m.runtime || null,
    genres: (m.genres || []).map((g) => g.name),
    releaseDate: m.release_date || null,
    year: releaseYear(m),
    languages: (m.spoken_languages || []).map((l) => l.english_name || l.name).filter(Boolean),
    countries: (m.production_countries || []).map((c) => c.name),
    companies: (m.production_companies || []).map((c) => c.name),
    budget: m.budget || null,
    revenue: m.revenue || null,
    backdrop: tmdbImage(m.backdrop_path, "w1280"),
    poster: tmdbImage(m.poster_path, "w500"),
    trailerKey: pickTrailer(m.videos?.results)?.key || null,
    cast: (m.credits?.cast || [])
      .slice(0, 24)
      .map((p) => mapPerson(p, { character: p.character || "" })),
    crew,
    similar: (m.similar?.results || []).slice(0, 20).map((r) => ({
      id: r.id,
      title: r.title,
      year: releaseYear(r),
    })),
  };
}
export async function getPerson(personId) {
  if (!personId) return null;

  const p = await tmdb(`/person/${personId}`, {
    append_to_response: "movie_credits",
  });
  if (!p) return null;

  const cast = (p.movie_credits?.cast || []).map((c) => ({
    id: c.id,
    title: c.title,
    year: releaseYear(c),
    role: c.character || "",
    popularity: c.popularity || 0,
  }));

  const directed = (p.movie_credits?.crew || [])
    .filter((c) => c.job === "Director")
    .map((c) => ({
      id: c.id,
      title: c.title,
      year: releaseYear(c),
      role: "Director",
      popularity: c.popularity || 0,
    }));

  return {
    id: p.id,
    name: p.name,
    photo: tmdbImage(p.profile_path, "h632"),
    biography: p.biography || "",
    birthday: p.birthday || null,
    deathday: p.deathday || null,
    birthplace: p.place_of_birth || null,
    department: p.known_for_department || null,
    cast,
    directed,
  };
}