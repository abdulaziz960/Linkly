import type { NextRequest } from "next/server";
import { getAppOrigin } from "./app-url";

/**
 * CSRF defense-in-depth for state-changing admin requests. The session
 * cookie is already SameSite=Lax, so a real cross-site browser request never
 * carries it in the first place - but nothing stopped a request that DOES
 * carry a valid cookie (replayed, or sent by a non-browser client) from
 * claiming an arbitrary Origin. Reject only an explicit, wrong Origin: a
 * request with no Origin header is left to SameSite/the session check, same
 * as Next.js's own Server Action origin check does.
 */
export function isTrustedOrigin(request: NextRequest | Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const allowed = new URL(getAppOrigin(request as { nextUrl?: { origin: string }; url?: string })).origin;
    return new URL(origin).origin === allowed;
  } catch {
    return false;
  }
}
