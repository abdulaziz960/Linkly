"use client";

import { useCallback, useEffect, useState } from "react";
import { CYCLE_SLUGS, cycleFromSlug, type BillingCycle } from "../lib/billing-pricing";

function cycleFromUrl(): BillingCycle {
  return cycleFromSlug(new URLSearchParams(window.location.search).get("billing"));
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
    if (cycle !== "شهري") url.searchParams.set("billing", CYCLE_SLUGS[cycle]);
    else url.searchParams.delete("billing");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  return { billingCycle, chooseBillingCycle };
}
