"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ANNUAL_DISCOUNT_PERCENT, computeYearlyPrice } from "../lib/billing-pricing";
import { useBillingCycle } from "./useBillingCycle";
import { useReducedMotion } from "./landing/motion";
import s from "./page.module.css";
import c from "./landing/landing.module.css";

type Plan = {
  id: string;
  name: string;
  price: string;
  audience: string;
  cta: string;
  items: readonly string[];
  featured?: boolean;
};

const copy = {
  ar: {
    monthlyTab: "شهري",
    yearlyTab: "سنوي",
    yearlySave: `وفر ${ANNUAL_DISCOUNT_PERCENT}٪`,
    currency: "ريال",
    perMonthSuffix: "/ الشهر",
    perYearSuffix: "/ السنة",
    billedYearly: (total: number) => `تُدفع دفعة واحدة بقيمة ${total} ريال سنويًا`,
    popular: "الأنسب لمعظم الفرق"
  },
  en: {
    monthlyTab: "Monthly",
    yearlyTab: "Yearly",
    yearlySave: `Save ${ANNUAL_DISCOUNT_PERCENT}%`,
    currency: "SAR",
    perMonthSuffix: "/ month",
    perYearSuffix: "/ year",
    billedYearly: (total: number) => `Billed once as ${total} SAR / year`,
    popular: "Best for most teams"
  }
} as const;

// Counts from the previous price to the new one when the billing cycle flips.
// The real value is always in the DOM for screen readers; the tween is visual only.
function AnimatedPrice({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (reduced || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 520);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(origin + (value - origin) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      from.current = value;
    };
  }, [value, reduced]);

  return (
    <>
      <b aria-hidden="true" className={c.pgAmount}>{shown}</b>
      <span className={c.srOnly}>{value}</span>
    </>
  );
}

export default function PricingPlanGrid({ plans, lang = "ar" }: { plans: readonly Plan[]; lang?: "ar" | "en" }) {
  const { billingCycle, chooseBillingCycle } = useBillingCycle();
  const text = copy[lang];
  const yearlySelected = billingCycle === "سنوي";
  const frame = useRef(0);

  // Cursor spotlight: two CSS variables on the hovered card, mouse only.
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse") return;
    const card = (event.target as HTMLElement).closest<HTMLElement>("[data-plan-card]");
    if (!card) return;
    const { clientX, clientY } = event;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const box = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${clientX - box.left}px`);
      card.style.setProperty("--my", `${clientY - box.top}px`);
    });
  };

  return <>
    <div className={c.pgToggle} role="tablist" data-cycle={yearlySelected ? "yearly" : "monthly"}>
      <span className={c.pgToggleThumb} aria-hidden="true" />
      <button type="button" role="tab" aria-selected={!yearlySelected} onClick={() => chooseBillingCycle("شهري")}>
        {text.monthlyTab}
      </button>
      <button type="button" role="tab" aria-selected={yearlySelected} onClick={() => chooseBillingCycle("سنوي")}>
        {text.yearlyTab}<span className={c.pgSave}>{text.yearlySave}</span>
      </button>
    </div>
    <div className={c.pgGrid} onPointerMove={onPointerMove}>{plans.map((p, pi) => {
      const featured = "featured" in p && p.featured;
      const monthlyPrice = Number(p.price);
      const yearly = computeYearlyPrice(monthlyPrice);
      const displayedPrice = yearlySelected ? yearly : monthlyPrice;
      return <article
        className={`${c.pgCard} ${featured ? c.pgFeatured : ""} ${s.revealFade}`}
        key={p.name}
        data-plan-card
        style={{ transitionDelay: `${pi * 90}ms` }}
      >
        {featured ? <span className={c.pgPopular}>{text.popular}</span> : null}
        <h3>{p.name}</h3>
        <p className={c.pgAudience}>{p.audience}</p>
        <div className={c.pgPrice}>
          <AnimatedPrice value={displayedPrice} />
          <span>{text.currency}<br />{yearlySelected ? text.perYearSuffix : text.perMonthSuffix}</span>
        </div>
        <p className={c.pgNote} data-show={yearlySelected || undefined} aria-hidden={!yearlySelected}>{text.billedYearly(yearly)}</p>
        <ul>{p.items.map((item, ii) => <li key={item} style={{ "--i": ii } as CSSProperties}><span className={c.pgCheck} aria-hidden="true">✓</span>{item}</li>)}</ul>
        <Link className={`${featured ? s.primaryLarge : s.planButton} ${c.pgCta}`} href={`/signup?plan=${encodeURIComponent(p.id)}${yearlySelected ? "&billing=yearly" : ""}`}>{p.cta}</Link>
      </article>;
    })}</div>
  </>;
}
