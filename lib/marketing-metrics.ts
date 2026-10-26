type MarketingEvent = "trial_start_click" | "trial_form_submit" | "trial_created";
type AnalyticsWindow = Window & { gtag?: (...args: unknown[]) => void };

/** Never include query strings, account identifiers, form values or referrers. */
export function marketingPage(pathname: string): string | null {
  if (pathname === "/" || pathname === "/en") return "home";
  if (/^\/(en\/)?(contact|faq|blog)$/.test(pathname)) return pathname.split("/").pop()!;
  if (/^\/(en\/)?solutions\/[^/]+$/.test(pathname)) return "solution";
  if (/^\/(en\/)?blog\/[^/]+$/.test(pathname)) return "article";
  if (pathname === "/signup") return "signup";
  return null;
}

export function analyticsEnabled() {
  return typeof document !== "undefined" && document.cookie.split(";").some((value) => value.trim() === "linkly_consent=accepted");
}

export function trackMarketingEvent(event: MarketingEvent) {
  if (typeof window === "undefined" || !analyticsEnabled()) return;
  const page = marketingPage(window.location.pathname);
  if (!page) return;
  (window as AnalyticsWindow).gtag?.("event", event, { page_category: page });
}
