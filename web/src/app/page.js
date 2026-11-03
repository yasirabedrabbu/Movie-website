import MovieCard from "@/components/MovieCard";
import movieData from "../../public/movies.json";

export default function Home() {
  const movies = movieData.movies.slice(0, 60);
  const hero = movies[0];

  return (
    <main>
      <header className="header">
        <div className="container header-inner">
          <div className="logo">
            Dhaka<span>Flix</span>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="container hero-content">
          <h1>{hero?.title}</h1>
          <p>
            {hero?.year} · {hero?.quality || "HD"}
          </p>
          <a className="btn btn-primary" href={`/movie/${hero?.id}`}>
            Play
          </a>
        </div>
      </section>

      <section className="container">
        <div className="grid">
          {movies.map((m) => (
            <MovieCard key={m.id} movie={m} />
          ))}
        </div>
      </section>
    </main>
  );
}