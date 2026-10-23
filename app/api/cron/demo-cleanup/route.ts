import { NextRequest, NextResponse } from "next/server";
import { isCronRequestAuthorized } from "../../../../lib/cron-auth";
import { deleteExpiredDemoWorkspaces } from "../../../../lib/demo-workspace";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Deletes the demo workspaces whose days are over (run hourly by Cloud Scheduler). */
export async function GET(request: NextRequest) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const removed = await deleteExpiredDemoWorkspaces();
  return NextResponse.json({ ok: true, removed });
}
