"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { Menu01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";

export default function MobileNav({ links }) {
  const [open, setOpen] = useState(false);

  // Escape chapleo band, ar drawer khola thakle page scroll bondho.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="mnav">
      <button
        type="button"
        className="mnav-toggle"
        aria-expanded={open}
        aria-controls="mnav-drawer"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon icon={open ? Cancel01Icon : Menu01Icon} size={24} />
      </button>

      {open && (
        <>
          <div className="mnav-backdrop" onClick={close} aria-hidden="true" />
          <nav id="mnav-drawer" className="mnav-drawer" aria-label="Categories">
            <p className="mnav-title">Browse</p>
            <ul>
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} onClick={close}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}
    </div>
  );
}