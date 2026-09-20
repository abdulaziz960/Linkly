import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const isDevelopment = process.env.NODE_ENV === "development";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https://connect.facebook.net https://www.googletagmanager.com https://cdn.moyasar.com`,
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
  "connect-src 'self' https://graph.facebook.com https://www.facebook.com https://connect.facebook.net https://www.googletagmanager.com https://www.google-analytics.com https://analytics.google.com https://api.moyasar.com https://*.sentry.io https://*.ingest.sentry.io",
  "frame-src https://www.facebook.com https://web.facebook.com https://business.facebook.com https://www.googletagmanager.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDevelopment ? [] : ["upgrade-insecure-requests"])
].join("; ");

const nextConfig: NextConfig = {
  // Produces a minimal self-contained .next/standalone/server.js + trimmed
  // node_modules - the basis for the Cloud Run Docker image.
  output: "standalone",
  reactStrictMode: true,
  agentRules: false,
  poweredByHeader: false,
  images: {
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;"
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), browsing-topics=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }
        ]
      },
      {
        // These popups navigate through a third-party origin (TikTok/Meta)
        // and back, which severs window.opener under same-origin-allow-popups
        // once the browser treats the popup as cross-origin-isolated from its
        // opener - the popup then can't postMessage/close itself and falls
        // back to a full-page redirect instead. unsafe-none keeps the opener
        // link intact for exactly these two routes.
        source: "/api/:provider(meta|tiktok)/callback",
        headers: [{ key: "Cross-Origin-Opener-Policy", value: "unsafe-none" }]
      }
    ];
  },
  outputFileTracingIncludes: {
    "/*": ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/ffmpeg-static/package.json"],
    "/api/**/*": ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/ffmpeg-static/package.json"],
    "/api/conversations/[id]/messages": ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/ffmpeg-static/package.json"],
    "/api/meta/webhook": ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/ffmpeg-static/package.json"]
  }
};

// Uploads source maps to Sentry for readable stack traces (needs
// SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT at build time to actually
// upload; silently skips that step otherwise, build/runtime behavior is
// unaffected either way). No-op on every request when SENTRY_DSN is unset.
export default withSentryConfig(nextConfig, {
  silent: true
});
