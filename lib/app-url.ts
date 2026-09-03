import type { NextRequest } from "next/server";

/**
 * The public origin to use for OAuth redirect URIs, activation/reset links,
 * and popup-callback postMessage targets. request.nextUrl.origin is NOT
 * reliable in production - behind Cloud Run's Serverless NEG the request's
 * Host header doesn't always reach Next.js the way it does locally, which
 * silently produced "https://0.0.0.0:8080/..." redirect URIs (breaking
 * every OAuth connect flow) and broken links in emailed activation/reset
 * URLs. APP_URL/NEXT_PUBLIC_APP_URL are explicitly configured and trusted;
 * the request-derived origin is only a last-resort fallback for local dev.
 */
export function getAppOrigin(request?: { nextUrl?: { origin: string }; url?: string }) {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (request?.nextUrl?.origin) return request.nextUrl.origin;
  if (request?.url) {
    try {
      return new URL(request.url).origin;
    } catch {
      // fall through
    }
  }
  return "https://linklysa.io";
}

export type AppOriginRequest = NextRequest | Request;
