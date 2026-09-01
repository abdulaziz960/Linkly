import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https://connect.facebook.net`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://graph.facebook.com https://www.facebook.com https://connect.facebook.net",
  "frame-src https://www.facebook.com https://web.facebook.com https://business.facebook.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDevelopment ? [] : ["upgrade-insecure-requests"])
].join("; ");

const nextConfig: NextConfig = {
  // Produces a minimal self-contained .next/standalone/server.js + trimmed
  // node_modules - the basis for the Cloud Run Docker image (Vercel's own
  // build doesn't need this, but it's harmless there too).
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

export default nextConfig;
