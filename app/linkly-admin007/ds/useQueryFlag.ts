"use client";

import { useEffect } from "react";

// Runs `onFlag` once when the page was opened with ?<name>=1 (used by the
// "quick action" menu), then removes the flag so a refresh does not re-open it.
// `onFlag` is intentionally read only on mount.
export function useQueryFlag(name: string, onFlag: () => void) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(name)) return;
    url.searchParams.delete(name);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    onFlag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
}
