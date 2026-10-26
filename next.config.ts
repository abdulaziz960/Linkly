import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./lib/security-headers";
import { withSentryConfig } from "@sentry/nextjs/config";


const nextConfig: NextConfig = {
  // Produces a minimal self-contained .next/standalone/server.js + trimmed
  // node_modules - the basis for the Cloud Run Docker image.
  output: "standalone",
  reactStrictMode: true,
  agentRules: false,
  poweredByHeader: false,
  async redirects() {
    return [{
      source: "/:path*",
      has: [{ type: "host", value: "www.linklysa.io" }],
      destination: "https://linklysa.io/:path*",
      permanent: true
    }];
  },
  images: {
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;"
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), browsing-topics=()" },
          // Public pages keep the browser default so Google Tag Assistant (which
          // opens the site from its own origin and talks to it through
          // window.opener) can connect for GTM preview/debug. The signed-in and
          // payment areas below keep the stricter same-origin-allow-popups.
          { key: "Cross-Origin-Opener-Policy", value: "unsafe-none" }
        ]
      },
      {
        source: "/:area(dashboard|linkly-admin007|billing|checkout|api)/:path*",
        headers: [{ key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }]
      },
      {
        // Brand images/icons keep their file names, so no immutable caching -
        // a day fresh plus a week of stale-while-revalidate avoids re-fetching
        // them on every page view without risking a logo change going unseen.
        source: "/:dir(assets|icons)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }]
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
