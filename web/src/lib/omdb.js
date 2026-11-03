import { cacheLife } from "next/cache";
import { config, hasOmdb } from "./config";

async function omdbRaw(imdbId) {
  "use cache";
  cacheLife("days");

  const qs = new URLSearchParams({ i: imdbId, apikey: config.omdb.apiKey });
  const res = await fetch(`${config.omdb.apiBase}?${qs}`);
  if (!res.ok) throw new Error(`OMDb HTTP ${res.status}`);
  const data = await res.json();
  if (data.Response === "False") {
    if (/not found|incorrect imdb/i.test(data.Error || "")) return null;
    throw new Error(`OMDb ${data.Error || "error"}`);
  }
  return data;
}

const num = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const text = (v) => (v && v !== "N/A" ? v : null);

export async function getImdbRating(imdbId) {
  if (!hasOmdb || !imdbId) return null;
  try {
    const d = await omdbRaw(imdbId);
    if (!d) return null;
    return {
      imdbId,
      rating: num(d.imdbRating),
      votes: num(d.imdbVotes),
      metascore: num(d.Metascore),
      rottenTomatoes: d.Ratings?.find((r) => r.Source === "Rotten Tomatoes")?.Value || null,
      rated: text(d.Rated),
      awards: text(d.Awards),
    };
  } catch (err) {
    console.warn(`[omdb] ${err.message}`);
    return null;
  }
}