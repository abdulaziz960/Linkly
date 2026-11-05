import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { ensureSchema } from "../../../../lib/database";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { getCrmAiSettings, saveCrmAiFlag, saveCrmAiSettings } from "../../../../lib/crm-ai";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

/** Whether the AI continues the chat of a lead a CRM assigned, as the assigned employee. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "developers"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  await ensureSchema();
  return jsonOk(await getCrmAiSettings(user.tenantId));
}

export async function PUT(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("متاح لمالك الحساب فقط", 403);
  await ensureSchema();
  const body = (await request.json().catch(() => null)) as { enabled?: unknown; platformLeads?: unknown; inquiries?: unknown } | null;
  if (typeof body?.platformLeads === "boolean") return jsonOk(await saveCrmAiFlag(user.tenantId, "platform_leads", body.platformLeads));
  if (typeof body?.inquiries === "boolean") return jsonOk(await saveCrmAiFlag(user.tenantId, "inquiries", body.inquiries));
  return jsonOk(await saveCrmAiSettings(user.tenantId, body?.enabled === true));
}
