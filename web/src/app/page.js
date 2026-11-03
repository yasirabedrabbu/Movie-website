import { Suspense } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HeroCarousel from "@/components/HeroCarousel";
import BrowseSection from "@/components/BrowseSection";
import { listMovies, getCategories } from "@/lib/movies";
import { getMovieMedia } from "@/lib/tmdb";

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

async function HomeContent() {
  const [slides, initial, categories] = await Promise.all([
    buildSlides(),
    listMovies(),
    getCategories(),
  ]);

  return (
    <>
      <HeroCarousel slides={slides} />
      <BrowseSection initial={initial} categories={categories} />
    </>
  );
}

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Suspense fallback={<div className="carousel skeleton" aria-busy="true" />}>
          <HomeContent />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}