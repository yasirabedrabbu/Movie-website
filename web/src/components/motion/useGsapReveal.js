"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

// key change hole (jemon filter/search) animation abar cholbe
export default function useGsapReveal(selector = ".card", key = "") {
  const ref = useRef(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      gsap.from(selector, {
        opacity: 0,
        y: 24,
        duration: 0.5,
        stagger: 0.03,
        ease: "power2.out",
        clearProps: "all",
      });
    }, ref);

    return () => ctx.revert();
  }, [selector, key]);

  return ref;
}