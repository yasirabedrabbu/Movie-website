export default function Hero({ movie }) {
  if (!movie) return null;

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="container hero-content">
        <h1 id="hero-title">{movie.title}</h1>
        <p>
          {movie.year} · {movie.quality || "HD"}
        </p>
        <div className="hero-actions">
          <a className="btn btn-primary" href={`/movie/${movie.id}`}>
            Play
          </a>
          <a className="btn btn-ghost" href={`/movie/${movie.id}#download`}>
            Details
          </a>
        </div>
      </div>
    </section>
  );
}