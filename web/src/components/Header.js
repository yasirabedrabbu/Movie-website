import { Suspense } from "react";
import Link from "next/link";
import HeaderSearch from "@/components/HeaderSearch";

export default function Header() {
  return (
    <header className="header">
      <div className="container header-inner">
        <Link href="/" className="logo" aria-label="DhakaFlix home">
          Dhaka<span>Flix</span>
        </Link>
        <Suspense fallback={<div className="header-search" />}>
          <HeaderSearch />
        </Suspense>
      </div>
    </header>
  );
}