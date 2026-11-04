"use client";

import { useSearchParams } from "next/navigation";
import Icon from "@/components/Icon";
import { Search01Icon } from "@hugeicons/core-free-icons";

// Plain GET form: works without JS and on every page. Submitting goes to /?q=...
export default function HeaderSearch() {
  const q = useSearchParams().get("q") || "";
  return (
    <form className="header-search" action="/" method="get" role="search">
      <Icon icon={Search01Icon} size={18} />
      <input
        key={q}
        type="search"
        name="q"
        className="search"
        placeholder="Titles, genres..."
        aria-label="Search movies"
        defaultValue={q}
        maxLength={100}
        enterKeyHint="search"
        autoComplete="off"
      />
    </form>
  );
}