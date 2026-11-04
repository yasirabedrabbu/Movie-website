"use client";

import { useState } from "react";

export default function Tabs({ tabs }) {
  const visible = tabs.filter((t) => t.content);
  const [active, setActive] = useState(visible[0]?.id);

  if (!visible.length) return null;

  const onKey = (e) => {
    const i = visible.findIndex((t) => t.id === active);
    if (e.key === "ArrowRight") setActive(visible[(i + 1) % visible.length].id);
    if (e.key === "ArrowLeft") setActive(visible[(i - 1 + visible.length) % visible.length].id);
  };

  return (
    <div className="mv-tabs">
      <div className="mv-tablist" role="tablist" onKeyDown={onKey}>
        {visible.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            className={`mv-tab${active === t.id ? " is-active" : ""}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {visible.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={active !== t.id}
          className="mv-tabpanel"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}