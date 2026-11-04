"use client";

import { useRef, useState } from "react";

export default function Tabs({ tabs }) {
  const visible = tabs.filter((t) => t.content);
  const [active, setActive] = useState(visible[0]?.id);
  const refs = useRef({});

  if (!visible.length) return null;

  const go = (id) => {
    setActive(id);
    refs.current[id]?.focus();
  };

  const onKey = (e) => {
    const i = visible.findIndex((t) => t.id === active);
    let target = null;
    if (e.key === "ArrowRight") target = visible[(i + 1) % visible.length];
    else if (e.key === "ArrowLeft") target = visible[(i - 1 + visible.length) % visible.length];
    else if (e.key === "Home") target = visible[0];
    else if (e.key === "End") target = visible[visible.length - 1];
    if (!target) return;
    e.preventDefault();
    go(target.id);
  };

  return (
    <div className="mv-tabs">
      <div className="mv-tablist" role="tablist" onKeyDown={onKey}>
        {visible.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
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