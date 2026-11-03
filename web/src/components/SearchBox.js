"use client";

export default function SearchBox({ value, onChange }) {
  return (
    <input
      type="search"
      className="search"
      placeholder="Movie khujun..."
      aria-label="Search movies"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}