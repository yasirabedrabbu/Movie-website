import Link from "next/link";

export default function CategoryTiles({ tiles }) {
  return (
    <div className="tiles">
      {tiles.map((t) => (
        <Link key={t.slug} href={`/category/${t.slug}`} className="tile">
          {t.poster && <img src={t.poster} alt="" loading="lazy" />}
          <span>
            <strong>{t.name}</strong>
            <small className="card-meta">{t.count} movies</small>
          </span>
        </Link>
      ))}
    </div>
  );
}