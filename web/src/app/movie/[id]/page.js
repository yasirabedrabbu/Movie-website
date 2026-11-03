import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Player from "./Player";
import { findMovie } from "@/lib/movies";
import { formatSize, formatYear } from "@/lib/format";

const BROWSER_PLAYABLE = ["mp4", "webm", "m4v"];

export default function MoviePage({ params }) {
  return (
    <>
      <Header />
      <main className="container detail">
        <Link href="/" className="btn btn-ghost">
          ← Back
        </Link>
        <Suspense fallback={<MovieSkeleton />}>
          <MovieContent params={params} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

async function MovieContent({ params }) {
  const { id } = await params;
  const movie = await findMovie(id);
  if (!movie) notFound();

  const ext = (movie.video || "").split("?")[0].split(".").pop().toLowerCase();
  const playsInBrowser = BROWSER_PLAYABLE.includes(ext);
  const meta = [formatYear(movie.year), movie.quality || "HD"];
  if (movie.size) meta.push(formatSize(movie.size));

  return (
    <div className="detail-grid">
      {movie.poster && (
        <img
          className="detail-poster"
          src={movie.poster}
          alt={`${movie.title} poster`}
          width="280"
          height="420"
        />
      )}

      <div>
        <h1>{movie.title}</h1>
        <p className="card-meta">{meta.join(" · ")}</p>

        <Player src={movie.video} title={movie.title} />

        <div className="hero-actions">
          <a
            className={`btn ${playsInBrowser ? "btn-ghost" : "btn-primary"}`}
            href={`vlc://${movie.video}`}
          >
            Open in VLC
          </a>
          <a
            className={`btn ${playsInBrowser ? "btn-primary" : "btn-ghost"}`}
            href={movie.video}
            download
          >
            Download
          </a>
        </div>
      </div>
    </div>
  );
}

function MovieSkeleton() {
  return (
    <div className="detail-grid" aria-busy="true" aria-label="Loading movie">
      <div className="detail-poster skeleton" />
      <div>
        <div className="skeleton skeleton-title" />
        <div className="player-wrap skeleton" />
      </div>
    </div>
  );
}