"use client";

import { useMemo, useState } from "react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import CategoryChips from "@/components/CategoryChips";
import SearchBox from "@/components/SearchBox";
import MovieGrid from "@/components/MovieGrid";
import Footer from "@/components/Footer";
import FadeIn from "@/components/motion/FadeIn";
import useGsapReveal from "@/components/motion/useGsapReveal";
import { allMovies, filterMovies, getCategories } from "@/lib/movies";
import { PAGE_SIZE } from "@/lib/constants";

export default function Home() {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");

  const categories = useMemo(() => getCategories(), []);
  const results = useMemo(
    () => filterMovies({ category, query }),
    [category, query]
  );
  const shown = results.slice(0, PAGE_SIZE);

  const gridRef = useGsapReveal(".card", `${category}|${query}`);

  return (
    <>
      <Header />
      <main>
        <FadeIn>
          <Hero movie={allMovies[0]} />
        </FadeIn>

        <section className="container" aria-label="Browse movies">
          <SearchBox value={query} onChange={setQuery} />
          <CategoryChips
            categories={categories}
            active={category}
            onChange={setCategory}
          />
          <p className="card-meta">
            {results.length} ta movie pawa gechhe
          </p>
          <div ref={gridRef}>
            <MovieGrid movies={shown} />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}