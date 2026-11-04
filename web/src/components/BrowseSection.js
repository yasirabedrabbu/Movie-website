"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import CategoryChips from "@/components/CategoryChips";
import FilterBar from "@/components/FilterBar";
import MovieGrid from "@/components/MovieGrid";
import useGsapReveal from "@/components/motion/useGsapReveal";

const DEFAULT_FILTERS = { sort: "new", quality: "All", lang: "All", decade: "All" };

async function fetchPage({ category, query, page, filters }) {
  const qs = new URLSearchParams({ page: String(page) });
  if (category !== "All") qs.set("category", category);
  if (query) qs.set("q", query);
  for (const [k, v] of Object.entries(filters)) {
    if (v !== "All") qs.set(k, v);
  }
  const res = await fetch(`/api/movies?${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function BrowseSection({
  initial,
  categories,
  query = "",
  initialCategory = "All",
  showChips = true,
}) {
  const pathname = usePathname();
  const storeKey = `df:browse:${pathname}:${query}`;

  const [category, setCategory] = useState(initialCategory);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [items, setItems] = useState(initial.movies);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(initial.page);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [revealKey, setRevealKey] = useState(0);
  const [ready, setReady] = useState(false);
  const requestId = useRef(0);
  const skipFirst = useRef(true);

  // Restore filters/category after back-navigation (client only, avoids hydration mismatch)
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storeKey) || "null");
      if (saved) {
        if (showChips && saved.category) setCategory(saved.category);
        if (saved.filters) setFilters({ ...DEFAULT_FILTERS, ...saved.filters });
      }
    } catch {}
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(storeKey, JSON.stringify({ category, filters }));
    } catch {}
  }, [ready, storeKey, category, filters]);

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    setError(false);
    fetchPage({ category, query, page: 1, filters })
      .then((r) => {
        if (id !== requestId.current) return;
        setItems(r.movies);
        setTotal(r.total);
        setHasMore(r.hasMore);
        setPage(1);
        setRevealKey((k) => k + 1);
      })
      .catch(() => {
        if (id === requestId.current) setError(true);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, query, filters]);

  const loadMore = () => {
    const id = requestId.current;
    setLoading(true);
    setError(false);
    fetchPage({ category, query, page: page + 1, filters })
      .then((r) => {
        if (id !== requestId.current) return;
        setItems((prev) => [...prev, ...r.movies]);
        setPage((p) => p + 1);
        setHasMore(r.hasMore);
        setTotal(r.total);
      })
      .catch(() => {
        if (id === requestId.current) setError(true);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  };

  const dirty =
    category !== initialCategory ||
    Object.entries(filters).some(([k, v]) => v !== DEFAULT_FILTERS[k]);

  const clearAll = () => {
    setCategory(initialCategory);
    setFilters(DEFAULT_FILTERS);
  };

  const gridRef = useGsapReveal(".card", revealKey);

  return (
    <section className="container browse" aria-label="Browse movies">
      {query && (
        <h1 className="browse-title">
          Results for &ldquo;{query}&rdquo;
        </h1>
      )}
      {showChips && (
        <CategoryChips categories={categories} active={category} onChange={setCategory} />
      )}
      <FilterBar value={filters} onChange={setFilters} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 36 }}>
        <p className="card-meta" aria-live="polite">
          {total.toLocaleString("en-US")} {total === 1 ? "result" : "results"}
        </p>
        {dirty && (
          <button type="button" className="btn btn-ghost filters-clear" onClick={clearAll}>
            Clear filters
          </button>
        )}
      </div>

      <div ref={gridRef} aria-busy={loading}>
        {items.length === 0 && !loading ? (
          <div className="empty-state">
            <p>
              {query ? `No movies match “${query}”.` : "No movies match these filters."}
            </p>
            {dirty && (
              <button type="button" className="btn btn-ghost" onClick={clearAll}>
                Reset filters
              </button>
            )}
          </div>
        ) : (
          <MovieGrid movies={items} />
        )}
      </div>

      {error && (
        <p className="empty" role="alert">
          Could not load movies. Please try again.
        </p>
      )}
      {hasMore && (
        <div style={{ display: "flex", justifyContent: "center", paddingBottom: 64 }}>
          <button type="button" className="btn btn-ghost" onClick={loadMore} disabled={loading}>
            {loading ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </section>
  );
}