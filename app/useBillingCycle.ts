"use client";

import { useCallback, useEffect, useState } from "react";
import { CYCLE_SLUGS, cycleFromSlug, type BillingCycle } from "../lib/billing-pricing";

// Every component using this hook on a page (plan cards, comparison table) follows the same choice.
const CYCLE_EVENT = "linkly:billing-cycle";

function cycleFromUrl(): BillingCycle {
  return cycleFromSlug(new URLSearchParams(window.location.search).get("billing"));
}

export function useBillingCycle() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("شهري");

  useEffect(() => {
    const syncFromUrl = () => setBillingCycle(cycleFromUrl());
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    window.addEventListener(CYCLE_EVENT, syncFromUrl);
    return () => {
      window.removeEventListener("popstate", syncFromUrl);
      window.removeEventListener(CYCLE_EVENT, syncFromUrl);
    };
  }, []);

  const chooseBillingCycle = useCallback((cycle: BillingCycle) => {
    setBillingCycle(cycle);
    const url = new URL(window.location.href);
    if (cycle !== "شهري") url.searchParams.set("billing", CYCLE_SLUGS[cycle]);
    else url.searchParams.delete("billing");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    window.dispatchEvent(new Event(CYCLE_EVENT));
  }, []);

  return { billingCycle, chooseBillingCycle };
}
