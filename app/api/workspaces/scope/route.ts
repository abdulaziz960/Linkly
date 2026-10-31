import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "../../_utils/json";
import { prisma } from "../../../../lib/prisma";
import { invalidateUserCache } from "../../../../lib/tenant-subscription-row";
import { getWorkspaceViewer, projectOf, SCOPE_COOKIE } from "../../../../lib/workspaces/service";
import { buildWorkspaceState } from "../../../../lib/workspaces/state";

export const runtime = "nodejs";

/**
 * Chooses what the dashboard shows: "all" (the inbox and reports of every project the user belongs to), or one project - which also
 * makes that project the user's working workspace. The user must be a member of the project; the request cannot name anything else.
 */
export async function POST(request: NextRequest) {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return jsonError("غير موجود", 404);
  const body = (await request.json().catch(() => ({}))) as { scope?: string; keepScope?: boolean };
  const scope = typeof body.scope === "string" ? body.scope : "";

  let cookieValue = "";
  if (scope === "all") {
    if (viewer.memberships.length < 2) return jsonError("عرض كل المشاريع يتطلب عضوية في أكثر من مشروع", 403);
    cookieValue = "all";
  } else {
    const target = projectOf(viewer, scope);
    if (!target) return jsonError("لا تملك عضوية في هذا المشروع", 403);
    await prisma.userAccount.update({ where: { id: viewer.user.id }, data: { tenantId: target.project.tenantId, role: target.employee.role } });
    invalidateUserCache();
    cookieValue = body.keepScope && viewer.memberships.length > 1 ? "all" : target.project.id;
  }

  const refreshed = await getWorkspaceViewer();
  const state = refreshed ? await buildWorkspaceState(refreshed) : null;
  // The new scope lives in the cookie this response sets; the request still carries the old one.
  if (state) state.scope = cookieValue;
  const response = jsonOk(state);
  response.cookies.set(SCOPE_COOKIE, cookieValue, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return response;
}
