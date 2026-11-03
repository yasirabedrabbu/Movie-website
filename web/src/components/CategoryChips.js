"use client";

export default function CategoryChips({ categories, active, onChange }) {
  const all = ["All", ...categories];

  return (
    <div className="chips" role="group" aria-label="Category filter">
      {all.map((cat) => (
        <button
          key={cat}
          type="button"
          className="chip"
          aria-pressed={active === cat}
          onClick={() => onChange(cat)}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}