"use client";

import { useEffect } from "react";
import s from "./page.module.css";

// The floating mobile CTA bar is meant to stand in for a "start trial"
// button while the visitor is reading a section with none of its own -
// showing it on top of the hero/inline/final CTA sections (each already
// offering the identical "ابدأ تجربتك مجانًا" action) just duplicates the
// same button twice on screen at once.
export default function MobileCtaVisibility() {
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(`.${CSS.escape(s.mobileCta)}`);
    const ctas = Array.from(document.querySelectorAll<HTMLElement>("[data-primary-cta]"));
    if (!bar || !ctas.length || typeof IntersectionObserver === "undefined") return;

    const visible = new Set<Element>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      bar.classList.toggle(s.mobileCtaHidden, visible.size > 0);
    }, { threshold: 0.2 });

    ctas.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}
