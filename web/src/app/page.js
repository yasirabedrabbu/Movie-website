import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HeroCarousel from "@/components/HeroCarousel";
import BrowseSection from "@/components/BrowseSection";
import { allMovies } from "@/lib/movies";
import { getMovieMedia } from "@/lib/tmdb";

const SLIDE_COUNT = 6;

async function buildSlides() {
  const picks = allMovies.slice(0, SLIDE_COUNT);
  return Promise.all(
    picks.map(async (m) => {
      const media = await getMovieMedia(m.title, m.year);
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

export default async function Home() {
  const slides = await buildSlides();

  return (
    <>
      <Header />
      <main>
        <HeroCarousel slides={slides} />
        <BrowseSection />
      </main>
      <Footer />
    </>
  );
}