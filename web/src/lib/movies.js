import movieData from "../../public/movies.json";

export const allMovies = movieData.movies;

export function getCategories() {
  return [...new Set(allMovies.map((m) => m.category))];
}

export function filterMovies({ category = "All", query = "" } = {}) {
  const q = query.trim().toLowerCase();
  return allMovies.filter((m) => {
    const matchCat = category === "All" || m.category === category;
    const matchQ = !q || m.title.toLowerCase().includes(q);
    return matchCat && matchQ;
  });
}

export function findMovie(id) {
  return allMovies.find((m) => m.id === id) || null;
}