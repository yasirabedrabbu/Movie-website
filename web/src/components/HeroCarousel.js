"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import TrailerModal from "@/components/TrailerModal";
import Icon from "@/components/Icon";
import {
  PlayIcon,
  PauseIcon,
  InformationCircleIcon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";

const INTERVAL_MS = 7000;
const QUERY = "(prefers-reduced-motion: reduce)";

function useReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(QUERY).matches,
    () => false
  );
}

export default function HeroCarousel({ slides }) {
  const [index, setIndex] = useState(0);
  const [showTrailer, setShowTrailer] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const reducedMotion = useReducedMotion();

  const count = slides.length;
  const playing =
    count > 1 && !userPaused && !hover && !focus && !showTrailer && !reducedMotion;

  const next = useCallback(() => setIndex((i) => (i + 1) % count), [count]);
  const prev = () => setIndex((i) => (i - 1 + count) % count);

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(next, INTERVAL_MS);
    return () => clearTimeout(t);
  }, [playing, index, next]);

  if (!count) return null;
  const slide = slides[index];

  return (
    <section
      className="hero-slider"
      aria-roledescription="carousel"
      aria-label="Featured movies"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false);
      }}
    >
      {slide.backdrop && (
        <img
          key={slide.id}
          className="hero-bg"
          src={slide.backdrop}
          alt=""
          fetchPriority={index === 0 ? "high" : "auto"}
        />
      )}

      <div className="container hero-content">
        <div
          key={slide.id}
          className="hero-copy"
          role="group"
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${count}`}
          aria-live={playing ? "off" : "polite"}
        >
          <h1 className="hero-title">{slide.title}</h1>

          <ul className="hero-meta">
            {slide.rating && (
              <li className="hero-rating">
                <Icon icon={StarIcon} size={16} />
                {slide.rating.toFixed(1)}
              </li>
            )}
            {slide.year && <li>{slide.year}</li>}
            {slide.runtime && <li>{Math.floor(slide.runtime / 60)}h {slide.runtime % 60}m</li>}
            <li className="hero-badge">{slide.quality || "HD"}</li>
            {slide.genres?.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>

          {slide.overview && <p className="hero-overview">{slide.overview}</p>}

          <div className="hero-actions">
            {slide.trailerKey ? (
              <button type="button" className="btn btn-primary" onClick={() => setShowTrailer(true)}>
                <Icon icon={PlayIcon} size={20} />
                Trailer
              </button>
            ) : (
              <Link className="btn btn-primary" href={slide.href}>
                <Icon icon={PlayIcon} size={20} />
                Watch
              </Link>
            )}
            <Link className="btn btn-ghost" href={slide.href}>
              <Icon icon={InformationCircleIcon} size={20} />
              More info
            </Link>
          </div>
        </div>
      </div>

      {count > 1 && (
        <>
          <button type="button" className="hero-nav prev" onClick={prev} aria-label="Previous slide">
            <Icon icon={ArrowLeft01Icon} size={24} />
          </button>
          <button type="button" className="hero-nav next" onClick={next} aria-label="Next slide">
            <Icon icon={ArrowRight01Icon} size={24} />
          </button>

          <div className="hero-dots" role="group" aria-label="Choose slide">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`hero-dot${i === index ? " is-active" : ""}`}
                aria-label={`Slide ${i + 1} of ${count}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>

          <button
            type="button"
            className="hero-pause"
            onClick={() => setUserPaused((p) => !p)}
            aria-label={userPaused ? "Start automatic slide show" : "Pause automatic slide show"}
          >
            <Icon icon={userPaused ? PlayIcon : PauseIcon} size={18} />
          </button>
        </>
      )}

      {showTrailer && slide.trailerKey && (
        <TrailerModal
          trailerKey={slide.trailerKey}
          title={slide.title}
          onClose={() => setShowTrailer(false)}
        />
      )}
    </section>
  );
}