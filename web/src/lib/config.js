import { SITE_NAME, PAGE_SIZE } from "./constants";

const env = process.env;

export const config = {
  site: {
    name: SITE_NAME,
    description: "Browse and watch movies",
    url: (env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, ""),
  },

  media: {
    baseUrl: (env.MEDIA_BASE_URL || "").replace(/\/+$/, ""),
  },

  tmdb: {
    token: env.TMDB_TOKEN || "",
    apiBase: "https://api.themoviedb.org/3",
    imageBase: "https://image.tmdb.org/t/p",
    language: env.TMDB_LANGUAGE || "en-US",
  },

  omdb: {
    apiKey: env.OMDB_KEY || "",
    apiBase: "https://www.omdbapi.com/",
  },

  page: { size: PAGE_SIZE },
};

export const hasTmdb = Boolean(config.tmdb.token);
export const hasOmdb = Boolean(config.omdb.apiKey);

// Full TMDB image URL, or null when TMDB has no image.
// Sizes: posters w185/w342/w500/w780, backdrops w780/w1280, people w185/h632.
export function tmdbImage(path, size = "w500") {
  return path ? `${config.tmdb.imageBase}/${size}${path}` : null;
}