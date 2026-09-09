import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { runAutomationRuleManually } from "../../../../../lib/automation-engine";
import { jsonError, jsonOk } from "../../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

// Kanban card "تشغيل أتمتة" quick action - runs one rule's actions against
// one conversation immediately, bypassing its normal trigger/conditions.
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "automations"))) return jsonError("لا تملك صلاحية الأتمتة", 403);

  const body = (await request.json().catch(() => null)) as { conversationId?: string } | null;
  if (!body?.conversationId) return jsonError("conversationId مطلوب", 400);

  try {
    await runAutomationRuleManually(id, user.tenantId, body.conversationId);
    return jsonOk({ ranAt: new Date().toISOString() });
  } catch {
    return jsonError("تعذر تشغيل القاعدة", 404);
  }
}
