import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { REMINDER_HOURS, getReminderSettings, saveReminderSettings } from "../../../../lib/crm-visit-reminders";
import { prisma } from "../../../../lib/prisma";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

/** The WhatsApp reminder before a visit: its settings and the approved templates the owner can choose from. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "pipeline"))) return jsonError("لا تملك صلاحية الوصول", 403);
  const templates = await prisma.template.findMany({ where: { tenantId: user.tenantId, status: "معتمد" }, orderBy: { name: "asc" }, select: { name: true, message: true } });
  return jsonOk({ settings: await getReminderSettings(user.tenantId), hours: REMINDER_HOURS, templates });
}

export async function PUT(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("إعدادات التذكير متاحة لمالك الحساب فقط", 403);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const result = await saveReminderSettings(user.tenantId, body ?? {});
  if (!result.ok) return jsonError(result.error, 400);
  return jsonOk({ settings: result.settings });
}
