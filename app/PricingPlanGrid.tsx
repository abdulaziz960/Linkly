"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { BILLING_CYCLES, CYCLE_SLUGS, priceForCycle } from "../lib/billing-pricing";
import { perMonthPrice, cycleBilledNote, cyclePriceSuffix, cycleSaveBadge, cycleTabLabel } from "../lib/billing-cycle-copy";
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
  custom?: boolean;
};

const copy = {
  ar: {
    currency: "ريال",
    popular: "الأنسب لمعظم الفرق",
    customPrice: "حسب احتياجك",
    customNote: "بدون سعر ثابت · عرض سعر خاص بعد التواصل"
  },
  en: {
    currency: "SAR",
    popular: "Best for most teams",
    customPrice: "Tailored to you",
    customNote: "No fixed price · a custom quote after you contact us"
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
  const cycleIndex = BILLING_CYCLES.indexOf(billingCycle);
  const multiMonth = billingCycle !== "شهري";
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
    <div className={c.pgToggle} role="tablist" data-index={cycleIndex}>
      <span className={c.pgToggleThumb} aria-hidden="true" />
      {BILLING_CYCLES.map((cycle) => {
        const badge = cycleSaveBadge(cycle, lang);
        return <button type="button" role="tab" key={cycle} aria-selected={cycle === billingCycle} onClick={() => chooseBillingCycle(cycle)}>
          {cycleTabLabel(cycle, lang)}{badge ? <span className={c.pgSave}>{badge}</span> : null}
        </button>;
      })}
    </div>
    <div className={c.pgGrid} onPointerMove={onPointerMove}>{plans.map((p, pi) => {
      const featured = "featured" in p && p.featured;
      const monthlyPrice = Number(p.price);
      const cycleTotal = priceForCycle(monthlyPrice, billingCycle);
      const displayedPrice = perMonthPrice(cycleTotal, billingCycle);
      return <article
        className={`${c.pgCard} ${featured ? c.pgFeatured : ""} ${s.revealFade}`}
        key={p.name}
        data-plan-card
        style={{ transitionDelay: `${pi * 90}ms` }}
      >
        {featured ? <span className={c.pgPopular}>{text.popular}</span> : null}
        <h3>{p.name}</h3>
        <p className={c.pgAudience}>{p.audience}</p>
        {p.custom ? <>
          <div className={c.pgPrice}><b className={c.pgAmount} style={{ fontSize: 30 }}>{text.customPrice}</b></div>
          <p className={c.pgNote} data-show>{text.customNote}</p>
        </> : <>
        <div className={c.pgPrice}>
          <AnimatedPrice value={displayedPrice} />
          <span>{text.currency}<br />{cyclePriceSuffix(billingCycle, lang)}</span>
        </div>
        <p className={c.pgNote} data-show={multiMonth || undefined} aria-hidden={!multiMonth}>{multiMonth ? cycleBilledNote(billingCycle, cycleTotal, lang) : ""}</p>
        </>}
        <ul>{p.items.map((item, ii) => <li key={item} style={{ "--i": ii } as CSSProperties}><span className={c.pgCheck} aria-hidden="true">✓</span>{item}</li>)}</ul>
        <Link className={`${featured ? s.primaryLarge : s.planButton} ${c.pgCta}`} href={p.custom ? (lang === "en" ? "/en/contact" : "/contact") : `/signup?plan=${encodeURIComponent(p.id)}${multiMonth ? `&billing=${CYCLE_SLUGS[billingCycle]}` : ""}`}>{p.cta}</Link>
      </article>;
    })}</div>
  </>;
}
