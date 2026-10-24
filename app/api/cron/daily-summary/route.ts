import { NextRequest, NextResponse } from "next/server";
import { isCronRequestAuthorized } from "../../../../lib/cron-auth";
import { getAppOrigin } from "../../../../lib/app-url";
import { sendDailySummaries } from "../../../../lib/catalog-daily-summary";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Sends each workspace's sales summary for today (run once a day by Cloud Scheduler, 20:30 UTC = 23:30 Saudi time). */
export async function GET(request: NextRequest) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await sendDailySummaries(getAppOrigin(request))) });
}
