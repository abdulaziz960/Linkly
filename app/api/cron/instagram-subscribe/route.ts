import { NextRequest, NextResponse } from "next/server";
import { isCronRequestAuthorized } from "../../../../lib/cron-auth";
import { resubscribeAllInstagramAccounts } from "../../../../lib/instagram-webhooks";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Subscribes every connected Instagram account to the app's webhooks (run once by hand, then daily by Cloud Scheduler). */
export async function GET(request: NextRequest) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const result = await resubscribeAllInstagramAccounts();
  return NextResponse.json({ ok: true, checked: result.checked, subscribed: result.subscribed, failedCount: result.failed.length, failed: result.failed.slice(0, 20), accounts: result.accounts.slice(0, 50) });
}
