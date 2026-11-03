import MovieCard from "@/components/MovieCard";

export default function MovieGrid({ movies }) {
  if (!movies || movies.length === 0) {
    return <p className="empty">Kono movie pawa jay nai.</p>;
  }

  return (
    <div className="grid">
      {movies.map((movie) => (
        <MovieCard key={movie.id} movie={movie} />
      ))}
    </div>
  );
}