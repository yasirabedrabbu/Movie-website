"use client";

import { useMemo, useState } from "react";
import CategoryChips from "@/components/CategoryChips";
import SearchBox from "@/components/SearchBox";
import MovieGrid from "@/components/MovieGrid";
import useGsapReveal from "@/components/motion/useGsapReveal";
import { filterMovies, getCategories } from "@/lib/movies";
import { PAGE_SIZE } from "@/lib/constants";

export default function BrowseSection() {
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
    <section className="container browse" aria-label="Browse movies">
      <SearchBox value={query} onChange={setQuery} />
      <CategoryChips
        categories={categories}
        active={category}
        onChange={setCategory}
      />
      <p className="card-meta" aria-live="polite">
        {results.length} results
      </p>
      <div ref={gridRef}>
        <MovieGrid movies={shown} />
      </div>
    </section>
  );
}