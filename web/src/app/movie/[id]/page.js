import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Icon from "@/components/Icon";
import MovieGrid from "@/components/MovieGrid";
import Player from "./Player";
import { findMovie, listMovies } from "@/lib/movies";
import { findTmdbId, getMovieDetails } from "@/lib/tmdb";
import { getImdbRating } from "@/lib/omdb";
import { formatSize, formatYear } from "@/lib/format";
import { SITE_NAME } from "@/lib/constants";
import {
  ArrowLeft01Icon,
  Download01Icon,
  PlayCircleIcon,
  PlayIcon,
  StarIcon,
} from "@hugeicons/core-free-icons";

const NATIVE = ["mp4", "webm", "m4v"];
const compact = new Intl.NumberFormat("en", { notation: "compact" });

const safe = (s) => {
  try { return decodeURIComponent(s); } catch { return s; }
};
const slug = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const extOf = (u) => (u || "").split("?")[0].split(".").pop().toLowerCase();
const runtimeText = (m) => (m ? `${Math.floor(m / 60)}h ${m % 60}m` : null);
const money = (n) =>
  n
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(n)
    : null;

function getVersions(movie) {
  if (movie.versions?.length) return movie.versions;
  const urls = (movie.videos?.length ? movie.videos : [movie.video]).filter(Boolean);
  return [
    {
      quality: movie.quality,
      size: movie.size,
      path: movie.path,
      files: urls.map((url) => ({
        url,
        name: safe(url.split("/").pop()),
        ext: extOf(url),
        size: null,
      })),
    },
  ];
}

async function matchRelated(similar, selfId) {
  const hits = await Promise.all(
    similar.map(async (s) => {
      const { movies } = await listMovies({ query: s.title, pageSize: 10 });
      return (
        movies.find(
          (m) =>
            m.tmdbId === s.id ||
            (m.year &&
              s.year &&
              Math.abs(m.year - s.year) <= 1 &&
              slug(m.title) &&
              slug(m.title) === slug(s.title))
        ) || null
      );
    })
  );
  const seen = new Set([selfId]);
  const out = [];
  for (const h of hits) {
    if (!h || seen.has(h.id)) continue;
    seen.add(h.id);
    out.push(h);
  }
  return out.slice(0, 12);
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const movie = await findMovie(id);
  if (!movie) return { title: `Movie not found | ${SITE_NAME}` };
  const label = movie.year ? `${movie.title} (${movie.year})` : movie.title;
  const qualities = movie.qualities?.length ? movie.qualities.join(", ") : movie.quality;
  const description = `Watch or download ${movie.title}${qualities ? ` in ${qualities}` : ""}.`;
  return {
    title: `${label} | ${SITE_NAME}`,
    description,
    openGraph: { title: `${label} | ${SITE_NAME}`, description, type: "video.movie" },
  };
}

export default function MoviePage({ params }) {
  return (
    <>
      <Header />
      <main>
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

  const tmdbId = movie.tmdbId ?? (await findTmdbId(movie.title, movie.year));
  const d = await getMovieDetails(tmdbId);
  const imdb = await getImdbRating(d?.imdbId);
  const related = d ? await matchRelated(d.similar, movie.id) : [];

  const versions = getVersions(movie);
  const allFiles = versions.flatMap((v) => v.files);
  const playable = allFiles.find((f) => NATIVE.includes(f.ext));
  const playSrc = playable?.url ?? allFiles[0]?.url ?? movie.video;
  const vlcSrc = allFiles[0]?.url ?? movie.video;

  const title = d?.title || movie.title;
  const poster = d?.poster || movie.poster;
  const backdrop = d?.backdrop || null;

  const meta = [
    formatYear(movie.year),
    runtimeText(d?.runtime),
    movie.quality || "HD",
    movie.size ? formatSize(movie.size) : null,
  ].filter(Boolean);

  const ratings = [
    imdb?.rating && {
      key: "imdb",
      label: "IMDb",
      value: imdb.rating.toFixed(1),
      suffix: "/10",
      note: imdb.votes ? compact.format(imdb.votes) : null,
      star: true,
    },
    d?.rating &&
      d.voteCount > 0 && {
        key: "tmdb",
        label: "TMDB",
        value: d.rating.toFixed(1),
        suffix: "/10",
        note: compact.format(d.voteCount),
        star: true,
      },
    imdb?.rottenTomatoes && {
      key: "rt",
      label: "Rotten Tomatoes",
      value: imdb.rottenTomatoes,
    },
    imdb?.metascore && {
      key: "meta",
      label: "Metascore",
      value: String(imdb.metascore),
      suffix: "/100",
    },
  ].filter(Boolean);

  const facts = [
    ["Original title", d?.originalTitle && d.originalTitle !== title ? d.originalTitle : null],
    ["Release date", d?.releaseDate],
    ["Runtime", runtimeText(d?.runtime)],
    ["Status", d?.status],
    ["Languages", d?.languages.join(", ")],
    ["Countries", d?.countries.join(", ")],
    ["Studios", d?.companies.slice(0, 4).join(", ")],
    ["Budget", money(d?.budget)],
    ["Revenue", money(d?.revenue)],
    ["Age rating", imdb?.rated],
    ["Awards", imdb?.awards],
    ["Category", movie.category],
  ].filter(([, v]) => v);

  return (
    <div className="mv">
      <section className="mv-hero" aria-labelledby="mv-title">
        {backdrop && <img className="mv-backdrop" src={backdrop} alt="" fetchPriority="high" />}
        <div className="container mv-hero-inner">
          <Link href="/" className="btn btn-ghost mv-back">
            <Icon icon={ArrowLeft01Icon} size={20} />
            Back
          </Link>
          <div className="mv-head">
            {poster && (
              <img
                className="mv-poster"
                src={poster}
                alt={`${title} poster`}
                width="240"
                height="360"
              />
            )}
            <div className="mv-info">
              <p className="card-meta">{meta.join(" · ")}</p>
              <h1 id="mv-title">{title}</h1>
              {d?.tagline && <p className="mv-tagline">{d.tagline}</p>}

              {d?.genres.length > 0 && (
                <ul className="mv-genres" aria-label="Genres">
                  {d.genres.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              )}

              {ratings.length > 0 && (
                <ul className="mv-ratings" aria-label="Ratings">
                  {ratings.map((r) => (
                    <li key={r.key}>
                      {r.star && <Icon icon={StarIcon} size={18} />}
                      <strong>{r.value}</strong>
                      {r.suffix && <span className="card-meta">{r.suffix}</span>}
                      <span className="card-meta">
                        {r.label}
                        {r.note ? ` · ${r.note}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="hero-actions">
                <a className="btn btn-primary" href="#player">
                  <Icon icon={PlayIcon} size={20} />
                  Watch
                </a>
                <a className="btn btn-ghost" href="#files">
                  <Icon icon={Download01Icon} size={20} />
                  Download
                </a>
                {vlcSrc && (
                  <a className="btn btn-ghost" href={`vlc://${vlcSrc}`}>
                    Open in VLC
                  </a>
                )}
                {d?.trailerKey && (
                  <a
                    className="btn btn-ghost"
                    href={`https://www.youtube.com/watch?v=${d.trailerKey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon icon={PlayCircleIcon} size={20} />
                    Trailer
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container mv-body">
        <section className="mv-section" id="player" aria-label="Player">
          <Player src={playSrc} title={title} />
        </section>

        {d?.overview && (
          <section className="mv-section" aria-labelledby="mv-overview">
            <h2 id="mv-overview">Overview</h2>
            <p className="mv-overview">{d.overview}</p>
          </section>
        )}

        {d?.cast.length > 0 && (
          <section className="mv-section" aria-labelledby="mv-cast">
            <h2 id="mv-cast">Cast</h2>
            <ul className="mv-cast">
              {d.cast.map((p) => (
                <li key={p.id}>
                  {p.photo ? (
                    <img src={p.photo} alt="" loading="lazy" width="185" height="278" />
                  ) : (
                    <div className="mv-cast-fallback" aria-hidden="true">
                      {[...p.name][0]}
                    </div>
                  )}
                  <strong>{p.name}</strong>
                  {p.character && <span>{p.character}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {d?.crew.length > 0 && (
          <section className="mv-section" aria-labelledby="mv-crew">
            <h2 id="mv-crew">Crew</h2>
            <ul className="mv-crew">
              {d.crew.map((c) => (
                <li key={`${c.id}-${c.job}`}>
                  <span>{c.job}</span>
                  {c.name}
                </li>
              ))}
            </ul>
          </section>
        )}

        {facts.length > 0 && (
          <section className="mv-section" aria-labelledby="mv-details">
            <h2 id="mv-details">Details</h2>
            <dl className="mv-details">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="mv-section" id="files" aria-labelledby="mv-files">
          <h2 id="mv-files">Available versions</h2>
          <ul className="mv-files">
            {versions.map((v) => (
              <li key={v.path || v.quality}>
                <div>
                  <strong>{v.quality || "HD"}</strong>{" "}
                  <span className="card-meta">
                    {formatSize(v.size)} · {v.files.length} {v.files.length === 1 ? "file" : "files"}
                  </span>
                </div>
                {v.files.map((f) => (
                  <div className="mv-file" key={f.url}>
                    <span className="mv-file-name">{f.name}</span>
                    <span className="card-meta">
                      {f.ext.toUpperCase()} · {formatSize(f.size)}
                    </span>
                    <a className="btn btn-ghost" href={f.url} download>
                      <Icon icon={Download01Icon} size={18} />
                      Download
                    </a>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </section>

        {related.length > 0 && (
          <section className="mv-section" aria-labelledby="mv-related">
            <h2 id="mv-related">More like this</h2>
            <MovieGrid movies={related} />
          </section>
        )}
      </div>
    </div>
  );
}

function MovieSkeleton() {
  return (
    <div className="container mv-body" aria-busy="true" aria-label="Loading movie">
      <div className="skeleton skeleton-title" />
      <div className="player-wrap skeleton" />
    </div>
  );
}