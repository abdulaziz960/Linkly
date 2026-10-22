import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { getEmployeeForUser, getVisibleAssigneeNames } from "../../../../lib/permissions-server";
import { inboxFingerprint } from "../../../../lib/conversations-version";
import { processDueAutomations } from "../../../../lib/automation-engine";

export const runtime = "nodejs";

/**
 * A small fingerprint of the inbox the signed-in user can see, for the dashboard's live refresh (see
 * lib/conversations-version.ts). The inbox itself (GET /api/conversations) is every conversation with every
 * message - about 2 MB - and rebuilding it just to answer "nothing changed" every few seconds, for every
 * open tab, was most of the load on the server and the database.
 *
 * The dashboard fetches the full inbox when this value changes (and at least every 30 seconds regardless,
 * which also covers the time-based fields such as the 24-hour window).
 */
// Delayed automation steps ("wait 5 minutes, then send...") used to be run by the inbox request every 3 seconds.
// The inbox is now downloaded only when it changes, so the live check keeps that going: at most once every
// AUTOMATION_TICK_MS per workspace, however many tabs are open.
const AUTOMATION_TICK_MS = 5000;
const lastAutomationTick = new Map<string, number>();

export async function GET(_request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "غير مصرح" }, { status: 401 });
  if (Date.now() - (lastAutomationTick.get(user.tenantId) ?? 0) >= AUTOMATION_TICK_MS) {
    lastAutomationTick.set(user.tenantId, Date.now());
    processDueAutomations(user.tenantId).catch((error) => console.error("Automation queue processing failed", error));
  }

  const employee = await getEmployeeForUser(user);
  const assigneeNames = await getVisibleAssigneeNames(user, employee);
  const version = await inboxFingerprint(user.tenantId, assigneeNames);
  return NextResponse.json({ ok: true, version }, { headers: { "Cache-Control": "private, no-store" } });
}
