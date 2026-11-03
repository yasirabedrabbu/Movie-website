"use client";

import { useEffect, useRef } from "react";

export default function TrailerModal({ trailerKey, title, onClose }) {
  const closeBtnRef = useRef(null);
  const modalBodyRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!trailerKey) return;

    previouslyFocusedRef.current = document.activeElement;
    closeBtnRef.current?.focus();

    const getFocusable = () =>
      modalBodyRef.current
        ? Array.from(
            modalBodyRef.current.querySelectorAll(
              'button, [href], input, select, textarea, iframe, [tabindex]:not([tabindex="-1"])'
            )
          )
        : [];

    const onKey = (e) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = getFocusable();
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [trailerKey, onClose]);

  if (!trailerKey) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} trailer`}
      onClick={onClose}
    >
      <div className="modal-body" ref={modalBodyRef} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          ref={closeBtnRef}
          className="btn btn-ghost modal-close"
          onClick={onClose}
          aria-label="Close trailer"
        >
          ✕ Close
        </button>
        <iframe
          className="modal-frame"
          src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1`}
          title={`${title} trailer`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}
