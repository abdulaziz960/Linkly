"use client";

import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { analyticsEnabled, marketingPage, trackMarketingEvent } from "../lib/marketing-metrics";

const reportVital: Parameters<typeof useReportWebVitals>[0] = (metric) => {
  if (!analyticsEnabled()) return;
  const page = marketingPage(window.location.pathname);
  if (!page) return;
  const trackingWindow = window as Window & { gtag?: (...args: unknown[]) => void };
  trackingWindow.gtag?.("event", "web_vitals", {
    metric_name: metric.name,
    value: metric.name === "CLS" ? Math.round(metric.value * 1000) : Math.round(metric.value),
    metric_value: metric.value,
    metric_rating: metric.rating,
    page_category: page,
    non_interaction: true
  });
};

export default function MarketingMetrics() {
  useReportWebVitals(reportVital);
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>('a[href="/signup"], a[href^="/signup?"]');
      if (link) trackMarketingEvent("trial_start_click");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
