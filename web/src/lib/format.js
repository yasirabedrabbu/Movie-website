export function formatSize(bytes) {
  if (!bytes) return "Unknown";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

export function formatYear(year) {
  return year ? String(year) : "—";
}