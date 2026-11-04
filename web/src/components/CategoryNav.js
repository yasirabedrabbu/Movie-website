import Link from "next/link";
import MobileNav from "@/components/MobileNav";
import { getCategories } from "@/lib/movies";
import { slugify } from "@/lib/format";

export default async function CategoryNav() {
  const categories = await getCategories();
  const links = [
    { href: "/", label: "Home" },
    ...categories.map((c) => ({ href: `/category/${slugify(c)}`, label: c })),
  ];

  return (
    <>
      <nav className="nav nav-desktop" aria-label="Categories">
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            {l.label}
          </Link>
        ))}
      </nav>
      <MobileNav links={links} />
    </>
  );
}