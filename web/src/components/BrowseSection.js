"use client";

import { useEffect, useRef, useState } from "react";
import CategoryChips from "@/components/CategoryChips";
import MovieGrid from "@/components/MovieGrid";
import useGsapReveal from "@/components/motion/useGsapReveal";

async function fetchPage({ category, query, page }) {
  const qs = new URLSearchParams({ page: String(page) });
  if (category !== "All") qs.set("category", category);
  if (query) qs.set("q", query);
  const res = await fetch(`/api/movies?${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function BrowseSection({ initial, categories, query = "" }) {
  const [category, setCategory] = useState("All");
  const [items, setItems] = useState(initial.movies);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(initial.page);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [revealKey, setRevealKey] = useState(0);
  const requestId = useRef(0);
  const skipFirst = useRef(true);

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    setError(false);
    fetchPage({ category, query, page: 1 })
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
  }, [category, query]);

  const loadMore = () => {
    const id = requestId.current;
    setLoading(true);
    setError(false);
    fetchPage({ category, query, page: page + 1 })
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

  const gridRef = useGsapReveal(".card", revealKey);

  return (
    <section className="container browse" aria-label="Browse movies">
      {query && (
        <h1 className="browse-title">
          Results for &ldquo;{query}&rdquo;
        </h1>
      )}
      <CategoryChips categories={categories} active={category} onChange={setCategory} />
      <p className="card-meta" aria-live="polite">
        {total} results
      </p>
      <div ref={gridRef} aria-busy={loading}>
        <MovieGrid movies={items} />
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