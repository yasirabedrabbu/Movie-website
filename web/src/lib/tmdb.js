import { cacheLife } from "next/cache";

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

async function tmdb(path) {
  "use cache";
  cacheLife("days");

  const res = await fetch(`https://api.themoviedb.org/3${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_TMDB_TOKEN}`,
      accept: "application/json",
    },
  });
  if (!res.ok) return null;
  return res.json();
}

// Movie title + year diye TMDB te khuje backdrop ar trailer anbe
export async function getMovieMedia(title, year) {
  "use cache";
  cacheLife("days");

  const q = encodeURIComponent(title);
  const y = year ? `&year=${year}` : "";
  const search = await tmdb(`/search/movie?query=${q}${y}`);
  const hit = search?.results?.[0];
  if (!hit) return null;

  const videos = await tmdb(`/movie/${hit.id}/videos`);
  const trailer = videos?.results?.find(
    (v) => v.site === "YouTube" && v.type === "Trailer"
  );

  return {
    title: hit.title,
    overview: hit.overview,
    rating: hit.vote_average,
    backdrop: hit.backdrop_path ? `${IMG}/original${hit.backdrop_path}` : null,
    poster: hit.poster_path ? `${IMG}/w500${hit.poster_path}` : null,
    trailerKey: trailer?.key || null,
  };
}