import type { ReactNode } from "react";

export type HeroKpi = { tone?: "t" | "g" | "o" | "p" | "r" | "b"; label: string; value: ReactNode; note?: ReactNode };

/** The teal header every redesigned page starts with: label, title, description, summary chips and an optional main action. */
export function PageHero({ eyebrow, title, description, chips = [], action, children }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; chips?: ReactNode[]; action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="camp-hero page-hero-teal">
      <div className="camp-hero-text">
        {eyebrow ? <small>{eyebrow}</small> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {chips.length ? <div className="camp-hero-chips">{chips.map((chip, index) => <span key={index}>{chip}</span>)}</div> : null}
      </div>
      {children}
      {action}
    </div>
  );
}

/** Colored summary cards (the same look as the campaign and report pages). */
export function KpiRow({ items }: { items: HeroKpi[] }) {
  return (
    <div className="seg-kpis kpi-row">
      {items.map((item, index) => (
        <div key={index} className={`seg-kpi seg-kpi-${item.tone === "g" ? "good" : item.tone === "o" ? "warn" : item.tone === "r" ? "bad" : item.tone === "p" ? "unsub" : item.tone === "b" ? "b" : "b"}`}>
          <span>{item.label}</span>
          <b>{item.value}</b>
          {item.note ? <small>{item.note}</small> : null}
        </div>
      ))}
    </div>
  );
}
