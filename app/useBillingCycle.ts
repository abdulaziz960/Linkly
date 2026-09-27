"use client";

import { useCallback, useEffect, useState } from "react";
import type { BillingCycle } from "../lib/billing-pricing";

function cycleFromUrl(): BillingCycle {
  return new URLSearchParams(window.location.search).get("billing") === "yearly" ? "سنوي" : "شهري";
}

export function useBillingCycle() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("شهري");

  useEffect(() => {
    const syncFromUrl = () => setBillingCycle(cycleFromUrl());
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  const chooseBillingCycle = useCallback((cycle: BillingCycle) => {
    setBillingCycle(cycle);
    const url = new URL(window.location.href);
    if (cycle === "سنوي") url.searchParams.set("billing", "yearly");
    else url.searchParams.delete("billing");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  return { billingCycle, chooseBillingCycle };
}
