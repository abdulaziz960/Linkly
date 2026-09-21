"use client";

import Link from "next/link";
import { useState } from "react";
import { ANNUAL_DISCOUNT_PERCENT, computeYearlyPrice, type BillingCycle } from "../lib/billing-pricing";
import s from "./page.module.css";

type Plan = {
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
    billedYearly: (total: number) => `تُدفع دفعة واحدة بقيمة ${total} ريال سنويًا`,
    popular: "الأنسب لمعظم الفرق"
  },
  en: {
    monthlyTab: "Monthly",
    yearlyTab: "Yearly",
    yearlySave: `Save ${ANNUAL_DISCOUNT_PERCENT}%`,
    currency: "SAR",
    perMonthSuffix: "/ month",
    billedYearly: (total: number) => `Billed once as ${total} SAR / year`,
    popular: "Best for most teams"
  }
} as const;

function Check() {
  return <span className={s.check} aria-hidden="true">✓</span>;
}

export default function PricingPlanGrid({ plans, lang = "ar" }: { plans: readonly Plan[]; lang?: "ar" | "en" }) {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("شهري");
  const text = copy[lang];

  return <>
    <div className={s.billingCycleToggle} role="tablist">
      <button type="button" role="tab" aria-selected={billingCycle === "شهري"} className={billingCycle === "شهري" ? s.active : ""} onClick={() => setBillingCycle("شهري")}>
        {text.monthlyTab}
      </button>
      <button type="button" role="tab" aria-selected={billingCycle === "سنوي"} className={billingCycle === "سنوي" ? s.active : ""} onClick={() => setBillingCycle("سنوي")}>
        {text.yearlyTab}<span className={s.billingCycleBadge}>{text.yearlySave}</span>
      </button>
    </div>
    <div className={s.planGrid}>{plans.map((p, pi) => {
      const featured = "featured" in p && p.featured;
      const monthlyPrice = Number(p.price);
      const yearly = computeYearlyPrice(monthlyPrice);
      const displayedPrice = billingCycle === "سنوي" ? Math.round(yearly / 12) : monthlyPrice;
      return <article className={`${featured ? s.featured : ""} ${s.revealFade}`} key={p.name} style={{ transitionDelay: `${pi * 90}ms` }}>
        {featured ? <span className={s.popular}>{text.popular}</span> : null}
        <h3>{p.name}</h3>
        <p className={s.planAudience}>{p.audience}</p>
        <div className={s.price}><b>{displayedPrice}</b><span>{text.currency}<br />{text.perMonthSuffix}</span></div>
        {billingCycle === "سنوي" ? <p className={s.planPriceNote}>{text.billedYearly(yearly)}</p> : null}
        <ul>{p.items.map((i) => <li key={i}><Check />{i}</li>)}</ul>
        <Link className={featured ? s.primaryLarge : s.planButton} href="/signup">{p.cta}</Link>
      </article>;
    })}</div>
  </>;
}
