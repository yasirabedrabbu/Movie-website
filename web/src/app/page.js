import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HeroCarousel from "@/components/HeroCarousel";
import BrowseSection from "@/components/BrowseSection";
import MovieRow from "@/components/MovieRow";
import { listMovies, getCategories, getHomeRows } from "@/lib/movies";
import { getMovieMedia } from "@/lib/tmdb";
import { Suspense } from "react";

const SLIDE_COUNT = 6;

async function buildSlides() {
  const { movies } = await listMovies({ pageSize: 40, sort: "new" });
  const withIds = movies.filter((m) => m.tmdbId);
  const rest = movies.filter((m) => !m.tmdbId);
  const picks = [...withIds, ...rest].slice(0, SLIDE_COUNT);

  return Promise.all(
    picks.map(async (m) => {
      const media = await getMovieMedia(m.title, m.year, m.tmdbId);
      return {
        id: m.id,
        title: media?.title || m.title,
        year: m.year,
        quality: m.quality,
        overview: media?.overview || "",
        backdrop: media?.backdrop || m.poster,
        trailerKey: media?.trailerKey || null,
        href: `/movie/${m.id}`,
      };
    })
  );
}

async function HomeContent({ searchParams }) {
  const sp = await searchParams;
  const q = String(sp?.q ?? "").trim().slice(0, 100);

  if (q) {
    // Search mode: puro grid + category chips.
    const [initial, categories] = await Promise.all([
      listMovies({ query: q }),
      getCategories(),
    ]);
    return <BrowseSection key={q} initial={initial} categories={categories} query={q} />;
  }

  // Home mode: hero + categorized rows.
  const [slides, rows] = await Promise.all([buildSlides(), getHomeRows()]);
  return (
    <>
      <HeroCarousel slides={slides} />
      {rows.map((row) => (
        <MovieRow key={row.id} row={row} />
      ))}
    </>
  );
}

export default function Home({ searchParams }) {
  return (
    <>
      <Header />
      <main>
        <Suspense fallback={<div className="carousel skeleton" aria-busy="true" />}>
          <HomeContent searchParams={searchParams} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}