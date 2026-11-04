"use client";

import { useSearchParams } from "next/navigation";

// Plain GET form: works without JS and on every page. Submitting goes to /?q=...
export default function HeaderSearch() {
  const q = useSearchParams().get("q") || "";
  return (
    <form className="header-search" action="/" method="get" role="search">
      <input
        key={q}
        type="search"
        name="q"
        className="search"
        placeholder="Search movies..."
        aria-label="Search movies"
        defaultValue={q}
        maxLength={100}
        enterKeyHint="search"
        autoComplete="off"
      />
    </form>
  );
}