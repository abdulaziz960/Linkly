import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

// Shared bearer-secret check for every app/api/cron/* endpoint. Fails closed
// when CRON_SECRET is unset. Uses a timing-safe comparison so the header
// check doesn't leak how many leading bytes of the secret matched via
// response-time differences (pre-launch audit finding, cron auth).
export function isCronRequestAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
