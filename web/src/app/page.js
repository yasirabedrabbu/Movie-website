import { Suspense } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HeroCarousel from "@/components/HeroCarousel";
import BrowseSection from "@/components/BrowseSection";
import CategoryTiles from "@/components/CategoryTiles";
import MovieGrid from "@/components/MovieGrid";
import HomeTabs from "@/components/HomeTabs";
import { listMovies, getCategories, getCategoryTiles } from "@/lib/movies";
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
        rating: media?.rating || null,
        runtime: media?.runtime || null,
        genres: media?.genres?.slice(0, 3) || [],
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
  const tab = String(sp?.tab ?? "home");

  if (q) {
    const [initial, categories] = await Promise.all([
      listMovies({ query: q, sort: "new" }),
      getCategories(),
    ]);
    return <BrowseSection key={q} initial={initial} categories={categories} query={q} />;
  }

  if (tab === "all") {
    const [initial, categories] = await Promise.all([
      listMovies({ sort: "new" }),
      getCategories(),
    ]);
    return (
      <>
        <HomeTabs active="all" />
        <BrowseSection key="all" initial={initial} categories={categories} />
      </>
    );
  }

  if (tab === "latest") {
    const latest = await listMovies({ pageSize: 60, sort: "new" });
    return (
      <>
        <HomeTabs active="latest" />
        <section className="container home-section">
          <h2 className="row-title">Latest additions</h2>
          <MovieGrid movies={latest.movies} />
        </section>
      </>
    );
  }

  const [slides, tiles, recent] = await Promise.all([
    buildSlides(),
    getCategoryTiles(),
    listMovies({ pageSize: 24, sort: "new" }),
  ]);

  return (
    <>
      <HeroCarousel slides={slides} />
      <HomeTabs active="home" />

      <section className="container home-section" aria-labelledby="browse-cats">
        <h2 id="browse-cats" className="row-title">Browse by category</h2>
        <CategoryTiles tiles={tiles} />
      </section>

      <section className="container home-section" aria-labelledby="recent">
        <h2 id="recent" className="row-title">Recently added</h2>
        <MovieGrid movies={recent.movies} />
      </section>
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