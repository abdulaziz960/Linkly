"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePlanAccess } from "../plan-access-context";
import type { ViewKey } from "../types";

export type ViewTab = {
  /** The sidebar view key this tab used to be: kept in the address so old links and reloads land on it. */
  viewKey: ViewKey;
  label: string;
  /** The feature's plain name in the upgrade message, when the tab text carries more than that. */
  lockLabel?: string;
  /** The person's role and plan allow this tab. */
  available: boolean;
  content: ReactNode;
};

/**
 * Former pages as tabs of one. A tab the plan does not include still shows, with a lock: pressing it opens
 * the same "upgrade your plan" message the sidebar entry used to. A tab the role may not see is hidden.
 * With a single visible tab there is no tab bar. `note` is shown under the bar when there is one.
 */
export default function ViewTabs({ initialKey, ariaLabel, tabs, note, className = "" }: { initialKey: ViewKey; ariaLabel: string; tabs: ViewTab[]; note?: ReactNode; className?: string }) {
  const { isViewLocked, promptForView } = usePlanAccess();
  const available = tabs.filter((tab) => tab.available);
  const visible = tabs.filter((tab) => tab.available || isViewLocked(tab.viewKey));
  const pick = (key: string) => (available.find((tab) => tab.viewKey === key) ?? available[0])?.viewKey ?? "";
  const [current, setCurrent] = useState(() => pick(initialKey));

  useEffect(() => {
    setCurrent(pick(initialKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey, available.map((tab) => tab.viewKey).join("|")]);

  function choose(tab: ViewTab) {
    if (!tab.available) {
      promptForView(tab.viewKey, tab.lockLabel ?? tab.label);
      return;
    }
    setCurrent(tab.viewKey);
    try {
      const params = new URLSearchParams(window.location.search);
      params.set("view", tab.viewKey);
      window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
    } catch {
      // the address is a convenience only
    }
  }

  const active = available.find((tab) => tab.viewKey === current) ?? available[0];
  const showBar = visible.length > 1;
  return (
    <>
      {showBar ? (
        <div className={`pipeline-tabs reports-hub-tabs ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
          {visible.map((tab) => (
            <button key={tab.viewKey} type="button" role="tab" aria-selected={tab.viewKey === active?.viewKey} onClick={() => choose(tab)}>
              {tab.label}
              {tab.available ? null : <span aria-hidden="true"> 🔒</span>}
            </button>
          ))}
        </div>
      ) : null}
      {showBar && note ? note : null}
      {active?.content ?? null}
    </>
  );
}
