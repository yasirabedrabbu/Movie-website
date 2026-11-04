"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function TrailerModal({ trailerKey, title, onClose }) {
  const closeBtnRef = useRef(null);
  const modalBodyRef = useRef(null);
  const onCloseRef = useRef(onClose);

  // Latest onClose ref e rakha, effect er dependency te na.
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!trailerKey) return;

    const previouslyFocused = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();

    const getFocusable = () =>
      modalBodyRef.current
        ? Array.from(modalBodyRef.current.querySelectorAll("button, a[href], iframe"))
        : [];

    const onKey = (e) => {
      if (e.key === "Escape") {
        onCloseRef.current();
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
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [trailerKey]);

  if (!trailerKey) return null;

  // body te portal: parent er overflow/stacking context modal ke aatkabe na.
  return createPortal(
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} trailer`}
      onClick={() => onCloseRef.current()}
    >
      <div
        className="modal-body"
        ref={modalBodyRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          ref={closeBtnRef}
          className="btn btn-ghost modal-close"
          onClick={() => onCloseRef.current()}
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
        <a
          className="btn btn-ghost"
          href={`https://www.youtube.com/watch?v=${trailerKey}`}
          target="_blank"
          rel="noopener noreferrer"
        >
             Watch on YouTube
        </a>
      </div>
    </div>,
    document.body
  );
}