export function contentSecurityPolicy(nonce?: string, isDevelopment = process.env.NODE_ENV === "development") {
  return [
  "default-src 'self'",
  // Document responses always receive a nonce in proxy.ts. Keep the legacy
  // fallback for provider API callback HTML, which is outside that matcher.
  `script-src 'self'${nonce ? ` 'nonce-${nonce}'` : " 'unsafe-inline'"}${isDevelopment ? " 'unsafe-eval'" : ""} https://connect.facebook.net https://www.googletagmanager.com https://tagassistant.google.com https://cdn.moyasar.com https://www.clarity.ms https://*.clarity.ms`,
  "style-src 'self' 'unsafe-inline' https://cdn.moyasar.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // api.moyasar.com: the embedded checkout form (app/billing/pay/[paymentId])
  // posts card details there directly from the browser with the publishable
  // key - never through our server. See lib/moyasar.ts's module comment.
  // *.sentry.io / *.ingest.sentry.io: client-side error/performance events
  // (instrumentation-client.ts) - a Sentry DSN only ever accepts events, so
  // this is fine to leave open even before SENTRY_DSN is actually set.
  // Clarity is configured in GTM and is loaded only after analytics consent.
  // Microsoft rotates its collector subdomains and also uses c.bing.com.
  "connect-src 'self' https://graph.facebook.com https://www.facebook.com https://connect.facebook.net https://www.googletagmanager.com https://tagassistant.google.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://stats.g.doubleclick.net https://api.moyasar.com https://*.sentry.io https://*.ingest.sentry.io https://www.clarity.ms https://*.clarity.ms https://c.bing.com",
  "frame-src blob: https://www.facebook.com https://web.facebook.com https://business.facebook.com https://www.googletagmanager.com https://tagassistant.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDevelopment ? [] : ["upgrade-insecure-requests"])
].join("; ");

}
