export default function MovieCard({ movie }) {
  return (
    <a className="card" href={`/movie/${movie.id}`} aria-label={movie.title}>
      <img src={movie.poster} alt={`${movie.title} poster`} loading="lazy" />
      {movie.quality && <span className="badge">{movie.quality}</span>}
      <div className="card-overlay">
        <div className="card-title">{movie.title}</div>
        <div className="card-meta">{movie.year}</div>
      </div>
    </a>
  );
}