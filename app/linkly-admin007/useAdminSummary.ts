"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { AdminSummary } from "../api/admin/summary/route";

const POLL_MS = 60_000;

// Sidebar badge counters. Failures are silent: the badges simply stay hidden.
export function useAdminSummary() {
  const pathname = usePathname();
  const [summary, setSummary] = useState<AdminSummary | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/summary", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { ok: boolean; data?: AdminSummary };
      if (body.ok && body.data) setSummary(body.data);
    } catch {
      // offline - keep the last known counts
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load, pathname]);

  return summary;
}
