import { Suspense } from "react";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BrowseSection from "@/components/BrowseSection";
import { getCategories, listMovies } from "@/lib/movies";
import { slugify } from "@/lib/format";

async function CategoryContent({ params }) {
  const { slug } = await params;
  const categories = await getCategories();
  const name = categories.find((c) => slugify(c) === slug);
  if (!name) notFound();

  const initial = await listMovies({ category: name, sort: "new" });

  return (
    <div className="cat-page">
      <BrowseSection
        key={name}
        initial={initial}
        categories={categories}
        initialCategory={name}
        showChips={false}
      />
    </div>
  );
}

export default function CategoryPage({ params }) {
  return (
    <>
      <Header />
      <main>
        <Suspense fallback={<div className="container cat-page"><div className="skeleton skeleton-title" /></div>}>
          <CategoryContent params={params} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}