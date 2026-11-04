"use client";

import { useState } from "react";

// Shows the image, or an empty dark tile if it fails to load.
// The card's title already appears in the overlay, so no text is needed here.
export default function Poster({
  src,
  width = 300,
  height = 450,
  loading = "lazy",
  className,
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <div className="card-fallback" aria-hidden="true" />;
  }

  return (
    <img
      src={src}
      alt=""
      width={width}
      height={height}
      loading={loading}
      decoding="async"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}