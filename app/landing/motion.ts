"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(REDUCED_QUERY).matches, () => false);
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

export function usePageVisible() {
  return useSyncExternalStore(subscribeVisibility, () => document.visibilityState === "visible", () => true);
}

// True while the element is on screen; drives autoplay so off-screen demos stop ticking.
export function useInView<T extends Element>(rootMargin = "0px", threshold = 0.2) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin, threshold });
    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin, threshold]);
  return [ref, inView] as const;
}

// Timers created by a demo, all cleared together on unmount or pause.
export function useTimers() {
  const [api] = useState(() => {
    const ids = new Set<number>();
    return {
      later(fn: () => void, ms: number) {
        const id = window.setTimeout(() => {
          ids.delete(id);
          fn();
        }, ms);
        ids.add(id);
      },
      clear() {
        ids.forEach((id) => window.clearTimeout(id));
        ids.clear();
      }
    };
  });
  useEffect(() => () => api.clear(), [api]);
  return api;
}
