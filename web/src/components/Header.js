import { Suspense } from "react";
import Link from "next/link";
import HeaderSearch from "@/components/HeaderSearch";
import CategoryNav from "@/components/CategoryNav";

export default function Header() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="header">
        <div className="container header-inner">
          <Link href="/" className="logo" aria-label="DhakaFlix home">
            Dhaka<span>Flix</span>
          </Link>

          <Suspense fallback={<nav className="nav" aria-label="Categories" />}>
            <CategoryNav />
          </Suspense>

          <Suspense fallback={<div className="header-search" />}>
            <HeaderSearch />
          </Suspense>
        </div>
      </header>
    </>
  );
}