import { NextRequest, NextResponse } from "next/server";
import { isCronRequestAuthorized } from "../../../../lib/cron-auth";
import { ensureReviewerWorkspace } from "../../../../lib/demo-workspace";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Creates the reviewers' standing demo account when missing and rebuilds it daily (?force=1 rebuilds it now). */
export async function GET(request: NextRequest) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const result = await ensureReviewerWorkspace({ force: request.nextUrl.searchParams.get("force") === "1" });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("Reviewer workspace failed", error);
    return NextResponse.json({ ok: false, error: "Reviewer workspace failed" }, { status: 500 });
  }
}
