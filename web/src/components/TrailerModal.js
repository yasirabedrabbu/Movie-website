"use client";

import { useEffect } from "react";

export default function TrailerModal({ trailerKey, title, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!trailerKey) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} trailer`}
      onClick={onClose}
    >
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
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