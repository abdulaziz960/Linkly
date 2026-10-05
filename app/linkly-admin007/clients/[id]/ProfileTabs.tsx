"use client";

import { useCallback, useEffect, useId, useState, type ReactNode } from "react";

export type ProfileTab = { id: string; label: string; count?: number; content: ReactNode };

// Tabbed client profile. Only the active tab is mounted, so heavy panels
// (notes, employees) load lazily; the active tab is mirrored in ?tab=.
export default function ProfileTabs({ tabs, initial = "overview" }: { tabs: ProfileTab[]; initial?: string }) {
  const baseId = useId();
  const [active, setActive] = useState(initial);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested && tabs.some((tab) => tab.id === requested)) setActive(requested);
    // Only read the URL once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = useCallback((id: string) => {
    setActive(id);
    const url = new URL(window.location.href);
    if (id === initial) url.searchParams.delete("tab");
    else url.searchParams.set("tab", id);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }, [initial]);

  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];

  return (
    <>
      <div className="ds-tabs" role="tablist" aria-label="أقسام ملف العميل">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${baseId}-${tab.id}`}
            aria-selected={current.id === tab.id}
            aria-controls={`${baseId}-panel`}
            tabIndex={current.id === tab.id ? 0 : -1}
            className="ds-tab"
            onClick={() => select(tab.id)}
            onKeyDown={(event) => {
              // RTL: ArrowLeft moves to the next tab, ArrowRight to the previous one.
              const next = event.key === "ArrowLeft" ? tabs[(index + 1) % tabs.length] : event.key === "ArrowRight" ? tabs[(index - 1 + tabs.length) % tabs.length] : null;
              if (!next) return;
              event.preventDefault();
              select(next.id);
              document.getElementById(`${baseId}-${next.id}`)?.focus();
            }}
          >
            {tab.label}
            {tab.count !== undefined ? <span className="ds-count-pill">{tab.count}</span> : null}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-${current.id}`}>{current.content}</div>
    </>
  );
}
