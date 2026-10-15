"use client";

import { useEffect, useState, type ReactNode } from "react";

export type ViewTab = {
  /** The sidebar view key this tab used to be: kept in the address so old links and reloads land on it. */
  viewKey: string;
  label: string;
  available: boolean;
  content: ReactNode;
};

/**
 * Two (or more) former pages as tabs of one. Only the tabs the plan / role allows are shown; with a single
 * one there is no tab bar. `initialKey` is the view the user arrived with.
 */
export default function ViewTabs({ initialKey, ariaLabel, tabs }: { initialKey: string; ariaLabel: string; tabs: ViewTab[] }) {
  const available = tabs.filter((tab) => tab.available);
  const pick = (key: string) => (available.find((tab) => tab.viewKey === key) ?? available[0])?.viewKey ?? "";
  const [current, setCurrent] = useState(() => pick(initialKey));

  useEffect(() => {
    setCurrent(pick(initialKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey, available.map((tab) => tab.viewKey).join("|")]);

  function choose(viewKey: string) {
    setCurrent(viewKey);
    try {
      const params = new URLSearchParams(window.location.search);
      params.set("view", viewKey);
      window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
    } catch {
      // the address is a convenience only
    }
  }

  const active = available.find((tab) => tab.viewKey === current) ?? available[0];
  return (
    <>
      {available.length > 1 ? (
        <div className="pipeline-tabs reports-hub-tabs" role="tablist" aria-label={ariaLabel}>
          {available.map((tab) => (
            <button key={tab.viewKey} type="button" role="tab" aria-selected={tab.viewKey === active?.viewKey} onClick={() => choose(tab.viewKey)}>
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}
      {active?.content ?? null}
    </>
  );
}
