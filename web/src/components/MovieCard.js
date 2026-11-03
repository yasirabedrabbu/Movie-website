import Link from "next/link";

export default function MovieCard({ movie }) {
  return (
    <Link className="card" href={`/movie/${movie.id}`}>
      {movie.poster ? (
        <img
          src={movie.poster}
          alt=""
          loading="lazy"
          decoding="async"
          width="300"
          height="450"
        />
      ) : (
        <div className="card-fallback" aria-hidden="true">
          {movie.title}
        </div>
      )}
      {movie.quality && <span className="badge">{movie.quality}</span>}
      <div className="card-overlay">
        <div className="card-title">{movie.title}</div>
        <div className="card-meta">{movie.year}</div>
      </div>
    </Link>
  );
}