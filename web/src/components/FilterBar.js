"use client";

export const SORTS = [
  ["new", "Newest"],
  ["year", "Year"],
  ["title", "A–Z"],
];
export const QUALITIES = [
  ["All", "Any quality"],
  ["2160p", "4K"],
  ["1080p", "1080p"],
  ["720p", "720p"],
  ["480p", "480p"],
];
export const LANGS = [
  ["All", "Any language"],
  ["hin", "Hindi"],
  ["tel", "Telugu"],
  ["tam", "Tamil"],
  ["eng", "English"],
  ["ben", "Bengali"],
  ["mal", "Malayalam"],
  ["kan", "Kannada"],
  ["urd", "Urdu"],
];
export const DECADES = [
  ["All", "Any year"],
  ["2020", "2020s"],
  ["2010", "2010s"],
  ["2000", "2000s"],
  ["1990", "1990s"],
  ["1980", "1980s"],
];

function Select({ label, value, options, onChange }) {
  return (
    <label className="filter">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function FilterBar({ value, onChange }) {
  const set = (key) => (v) => onChange({ ...value, [key]: v });
  return (
    <div className="filters" role="group" aria-label="Filter movies">
      <Select label="Sort" value={value.sort} options={SORTS} onChange={set("sort")} />
      <Select label="Quality" value={value.quality} options={QUALITIES} onChange={set("quality")} />
      <Select label="Audio" value={value.lang} options={LANGS} onChange={set("lang")} />
      <Select label="Year" value={value.decade} options={DECADES} onChange={set("decade")} />
    </div>
  );
}