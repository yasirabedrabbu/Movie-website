import MovieCard from "@/components/MovieCard";

export default function MovieRow({ row }) {
  return (
    <section className="row" id={row.id} aria-labelledby={`${row.id}-title`}>
      <div className="container">
        <h2 id={`${row.id}-title`} className="row-title">
          {row.title}
        </h2>
        <div className="row-track">
          {row.movies.map((m) => (
            <div className="row-item" key={m.id}>
              <MovieCard movie={m} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}