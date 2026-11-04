import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Icon from "@/components/Icon";
import MovieGrid from "@/components/MovieGrid";
import ShareButton from "@/components/ShareButton";
import { listMovies } from "@/lib/movies";
import { getPerson } from "@/lib/tmdb";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";

const slug = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

async function matchLibrary(credits) {
  const top = [...credits].sort((a, b) => b.popularity - a.popularity).slice(0, 40);
  const hits = await Promise.all(
    top.map(async (c) => {
      const { movies } = await listMovies({ query: c.title, pageSize: 10 });
      return (
        movies.find(
          (m) =>
            m.tmdbId === c.id ||
            (m.year &&
              c.year &&
              Math.abs(m.year - c.year) <= 1 &&
              slug(m.title) === slug(c.title))
        ) || null
      );
    })
  );
  const seen = new Set();
  const out = [];
  for (const h of hits) {
    if (!h || seen.has(h.id)) continue;
    seen.add(h.id);
    out.push(h);
  }
  return out;
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const p = await getPerson(id);
  if (!p) return { title: "Person not found" };

  const description = p.biography
    ? p.biography.length > 180
      ? `${p.biography.slice(0, 177)}...`
      : p.biography
    : `Movies with ${p.name}`;

  return {
    title: p.name,
    description,
    alternates: { canonical: `/person/${id}` },
    openGraph: {
      title: p.name,
      description,
      type: "profile",
      url: `/person/${id}`,
      images: p.photo ? [{ url: p.photo, alt: p.name }] : undefined,
    },
    twitter: {
      card: p.photo ? "summary" : "summary_large_image",
      title: p.name,
      description,
      images: p.photo ? [p.photo] : undefined,
    },
  };
}

export default function PersonPage({ params }) {
  return (
    <>
      <Header />
      <main>
        <Suspense fallback={<div className="container pp-skeleton skeleton" aria-busy="true" />}>
          <PersonContent params={params} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

async function PersonContent({ params }) {
  const { id } = await params;
  const p = await getPerson(id);
  if (!p) notFound();

  const [actedIn, directedIn] = await Promise.all([
    matchLibrary(p.cast),
    matchLibrary(p.directed),
  ]);
  const directedIds = new Set(directedIn.map((m) => m.id));
  const actedOnly = actedIn.filter((m) => !directedIds.has(m.id));

  const facts = [
    ["Known for", p.department],
    ["Born", p.birthday],
    ["Died", p.deathday],
    ["Birthplace", p.birthplace],
  ].filter(([, v]) => v);

  return (
    <div className="container pp">
      <Link href="/" className="btn btn-ghost pp-back">
        <Icon icon={ArrowLeft01Icon} size={20} />
        Back
      </Link>

      <section className="pp-head">
        {p.photo ? (
          <img className="pp-photo" src={p.photo} alt={p.name} width="240" height="360" />
        ) : (
          <div className="pp-photo pp-photo-fallback" aria-hidden="true">
            {[...p.name][0]}
          </div>
        )}
        <div className="pp-info">
          <h1>{p.name}</h1>
          {facts.length > 0 && (
            <dl className="mv-details">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {p.biography && <p className="mv-overview pp-bio">{p.biography}</p>}
          <div className="hero-actions pp-actions">
            <ShareButton title={p.name} text={`Movies with ${p.name}`} />
          </div>
        </div>
      </section>

      {directedIn.length > 0 && (
        <section className="mv-section">
          <h2>Directed</h2>
          <MovieGrid movies={directedIn} />
        </section>
      )}

      {actedOnly.length > 0 && (
        <section className="mv-section">
          <h2>Acted in</h2>
          <MovieGrid movies={actedOnly} />
        </section>
      )}

      {actedIn.length === 0 && directedIn.length === 0 && (
        <p className="empty">No movies by {p.name} found in the library.</p>
      )}
    </div>
  );
}