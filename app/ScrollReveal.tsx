"use client";

import { useEffect } from "react";
import s from "./page.module.css";

export default function ScrollReveal() {
  useEffect(() => {
    const selector = [s.reveal, s.revealFade].filter(Boolean).map(name => `.${CSS.escape(name)}`).join(", ");
    if (!selector) return;
    const items = Array.from(document.querySelectorAll<HTMLElement>(selector));
    if (!items.length) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      items.forEach(el => el.classList.add(s.visible));
      return;
    }

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add(s.visible);
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.15, rootMargin: "0px 0px -60px 0px" });

    items.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}
