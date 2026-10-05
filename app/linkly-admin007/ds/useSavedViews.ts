"use client";

import { useCallback, useEffect, useState } from "react";

export type SavedView<F> = { id: string; name: string; filters: F };

// Saved filter sets live in this browser only (localStorage) - no API involved.
export function useSavedViews<F>(storageKey: string) {
  const [views, setViews] = useState<SavedView<F>[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setViews(JSON.parse(raw) as SavedView<F>[]);
    } catch {
      setViews([]);
    }
  }, [storageKey]);

  const persist = useCallback((next: SavedView<F>[]) => {
    setViews(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Storage unavailable: the view still works for this visit.
    }
  }, [storageKey]);

  const save = useCallback((name: string, filters: F) => {
    persist([...views.filter((view) => view.name !== name), { id: `${Date.now()}`, name, filters }]);
  }, [persist, views]);

  const remove = useCallback((id: string) => persist(views.filter((view) => view.id !== id)), [persist, views]);

  return { views, save, remove };
}
