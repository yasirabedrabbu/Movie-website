import Link from "next/link";

export default function Header() {
  return (
    <header className="header">
      <div className="container header-inner">
        <Link href="/" className="logo" aria-label="DhakaFlix home">
          Dhaka<span>Flix</span>
        </Link>
      </div>
    </header>
  );
}