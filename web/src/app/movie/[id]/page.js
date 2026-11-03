import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Player from "./Player";
import { findMovie } from "@/lib/movies";
import { formatSize, formatYear } from "@/lib/format";

export default async function MoviePage({ params }) {
  const { id } = await params;
  const movie = findMovie(id);
  if (!movie) notFound();

  return (
    <>
      <Header />
      <main className="container detail">
        <Link href="/" className="btn btn-ghost">
          ← Back
        </Link>

        <div className="detail-grid">
          {movie.poster && (
            <img
              className="detail-poster"
              src={movie.poster}
              alt={`${movie.title} poster`}
            />
          )}

          <div>
            <h1>{movie.title}</h1>
            <p className="card-meta">
              {formatYear(movie.year)} · {movie.quality || "HD"} ·{" "}
              {formatSize(movie.size)}
            </p>
            <p className="card-meta">{movie.folder}</p>

            <Player src={movie.video} title={movie.title} />

            <div className="hero-actions">
              <a className="btn btn-primary" href={movie.video} download>
                Download
              </a>
              <a className="btn btn-ghost" href={`vlc://${movie.video}`}>
                VLC te khulun
              </a>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}