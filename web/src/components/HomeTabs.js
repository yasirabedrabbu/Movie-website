import Link from "next/link";

const TABS = [
  { id: "home", label: "Home", href: "/" },
  { id: "latest", label: "Latest", href: "/?tab=latest" },
  { id: "all", label: "All movies", href: "/?tab=all" },
];

export default function HomeTabs({ active }) {
  return (
    <nav className="home-tabs container" aria-label="Browse views">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          className={`home-tab${active === t.id ? " is-active" : ""}`}
          aria-current={active === t.id ? "page" : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}