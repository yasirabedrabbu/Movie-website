import Link from "next/link";
import { getCategories } from "@/lib/movies";
import { slugify } from "@/lib/format";

export default async function CategoryNav() {
  const categories = await getCategories();

  return (
    <nav className="nav" aria-label="Categories">
      <Link href="/#recent">Latest</Link>
      {categories.map((c) => (
        <Link key={c} href={`/#${slugify(c)}`}>
          {c}
        </Link>
      ))}
    </nav>
  );
}