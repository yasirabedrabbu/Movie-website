"use client";

import { useEffect, useState, useCallback } from "react";
import TrailerModal from "@/components/TrailerModal";

export default function HeroCarousel({ slides }) {
  const [index, setIndex] = useState(0);
  const [showTrailer, setShowTrailer] = useState(false);
  const count = slides.length;

  const next = useCallback(() => setIndex((i) => (i + 1) % count), [count]);
  const prev = () => setIndex((i) => (i - 1 + count) % count);

  useEffect(() => {
    if (count < 2 || showTrailer) return;
    const t = setInterval(next, 6000);
    return () => clearInterval(t);
  }, [count, next, showTrailer]);

  if (!count) return null;
  const slide = slides[index];

  return (
    <section className="carousel" aria-roledescription="carousel" aria-label="Featured movies">
      {slide.backdrop && (
        <img className="carousel-bg" src={slide.backdrop} alt="" />
      )}
      <div className="container carousel-content">
        <p className="card-meta">{slide.year} · {slide.quality || "HD"}</p>
        <h1>{slide.title}</h1>
        <p className="carousel-overview">{slide.overview}</p>
        <div className="hero-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowTrailer(true)}
            disabled={!slide.trailerKey}
          >
            ▶ Trailer
          </button>
          <a className="btn btn-ghost" href={slide.href}>
            Details
          </a>
        </div>
      </div>

      <button type="button" className="carousel-nav prev" onClick={prev} aria-label="Previous slide">‹</button>
      <button type="button" className="carousel-nav next" onClick={next} aria-label="Next slide">›</button>

      <div className="carousel-dots" role="tablist">
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className="dot"
            aria-label={`Slide ${i + 1}`}
            aria-selected={i === index}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>

      {showTrailer && (
        <TrailerModal
          trailerKey={slide.trailerKey}
          title={slide.title}
          onClose={() => setShowTrailer(false)}
        />
      )}
    </section>
  );
}