import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { ensureSchema } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";
import { logAdminAction, getTenantCompanyName } from "../../../../lib/subscriptions";
import { MIN_ESCALATION_MINUTES, MAX_ESCALATION_MINUTES } from "../../../../lib/response-sla";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  await ensureSchema();
  const preference = await prisma.tenantPreference.findUnique({ where: { tenantId: user.tenantId } });
  return jsonOk({
    leadsPipelineEnabled: preference?.leadsPipelineEnabled !== 0,
    reengagementEnabled: preference?.reengagementEnabled === 1,
    reengagementDays: preference?.reengagementDays || 30,
    reengagementTemplateName: preference?.reengagementTemplateName || "",
    offHoursAutoReplyEnabled: preference?.offHoursAutoReplyEnabled === 1,
    offHoursAutoReplyMessage: preference?.offHoursAutoReplyMessage || "",
    escalationMinutes: preference?.escalationMinutes || 30
  });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = await request.json().catch(() => null) as {
    leadsPipelineEnabled?: unknown;
    reengagementEnabled?: unknown;
    reengagementDays?: unknown;
    reengagementTemplateName?: unknown;
    offHoursAutoReplyEnabled?: unknown;
    offHoursAutoReplyMessage?: unknown;
    escalationMinutes?: unknown;
  } | null;
  if (!body) return jsonError("طلب غير صالح", 400);

  await ensureSchema();
  const existing = await prisma.tenantPreference.findUnique({ where: { tenantId: user.tenantId } });

  const data: {
    leadsPipelineEnabled?: number;
    reengagementEnabled?: number;
    reengagementDays?: number;
    reengagementTemplateName?: string;
    offHoursAutoReplyEnabled?: number;
    offHoursAutoReplyMessage?: string;
    escalationMinutes?: number;
  } = {};

  if (body.leadsPipelineEnabled !== undefined) {
    if (typeof body.leadsPipelineEnabled !== "boolean") return jsonError("قيمة مسار العملاء غير صالحة", 400);
    data.leadsPipelineEnabled = body.leadsPipelineEnabled ? 1 : 0;
  }
  if (body.reengagementEnabled !== undefined) {
    if (typeof body.reengagementEnabled !== "boolean") return jsonError("قيمة تفعيل تذكير الانقطاع غير صالحة", 400);
    data.reengagementEnabled = body.reengagementEnabled ? 1 : 0;
  }
  if (body.reengagementDays !== undefined) {
    if (typeof body.reengagementDays !== "number" || !Number.isInteger(body.reengagementDays) || body.reengagementDays < 1 || body.reengagementDays > 365) {
      return jsonError("عدد أيام التذكير يجب أن يكون بين 1 و365", 400);
    }
    data.reengagementDays = body.reengagementDays;
  }
  if (body.reengagementTemplateName !== undefined) {
    if (typeof body.reengagementTemplateName !== "string") return jsonError("اسم قالب التذكير غير صالح", 400);
    data.reengagementTemplateName = body.reengagementTemplateName.trim();
  }
  if (body.offHoursAutoReplyEnabled !== undefined) {
    if (typeof body.offHoursAutoReplyEnabled !== "boolean") return jsonError("قيمة تفعيل الرد خارج أوقات العمل غير صالحة", 400);
    data.offHoursAutoReplyEnabled = body.offHoursAutoReplyEnabled ? 1 : 0;
  }
  if (body.offHoursAutoReplyMessage !== undefined) {
    if (typeof body.offHoursAutoReplyMessage !== "string") return jsonError("رسالة الرد خارج أوقات العمل غير صالحة", 400);
    data.offHoursAutoReplyMessage = body.offHoursAutoReplyMessage.trim();
  }
  if (body.escalationMinutes !== undefined) {
    if (typeof body.escalationMinutes !== "number" || !Number.isInteger(body.escalationMinutes) || body.escalationMinutes < MIN_ESCALATION_MINUTES || body.escalationMinutes > MAX_ESCALATION_MINUTES) {
      return jsonError(`عدد دقائق التصعيد يجب أن يكون بين ${MIN_ESCALATION_MINUTES} و${MAX_ESCALATION_MINUTES}`, 400);
    }
    data.escalationMinutes = body.escalationMinutes;
  }

  const preference = await prisma.tenantPreference.upsert({
    where: { tenantId: user.tenantId },
    update: { ...data, updatedAt: new Date().toISOString() },
    create: {
      tenantId: user.tenantId,
      leadsPipelineEnabled: existing?.leadsPipelineEnabled ?? 1,
      reengagementEnabled: 0,
      reengagementDays: 30,
      reengagementTemplateName: "",
      offHoursAutoReplyEnabled: 0,
      offHoursAutoReplyMessage: "",
      escalationMinutes: 30,
      ...data,
      updatedAt: new Date().toISOString()
    }
  });

  if (Object.keys(data).length) {
    await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم تعديل إعدادات مساحة العمل بواسطة ${user.name}.`, "معلومة", "الإعدادات");
  }

  return jsonOk({
    leadsPipelineEnabled: preference.leadsPipelineEnabled !== 0,
    reengagementEnabled: preference.reengagementEnabled === 1,
    reengagementDays: preference.reengagementDays,
    reengagementTemplateName: preference.reengagementTemplateName,
    offHoursAutoReplyEnabled: preference.offHoursAutoReplyEnabled === 1,
    offHoursAutoReplyMessage: preference.offHoursAutoReplyMessage,
    escalationMinutes: preference.escalationMinutes
  });
}
