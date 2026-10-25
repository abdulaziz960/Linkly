import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { prisma } from "../../../../lib/prisma";
import { parseCampaignTags, parseRiyadhDateTime, processCampaignBatch } from "../../../../lib/campaign-engine";
import { OPT_OUT_ERROR } from "../../../../lib/campaign-metrics";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

const SETTABLE_STATUSES = new Set(["ملغاة", "قيد الإرسال", "مجدولة", "مؤرشفة", "الحملة أنجزت"]);

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json()) as { name?: string; status?: string; sendNow?: boolean; retryFailed?: boolean; description?: string; tags?: string; scheduledAt?: string };

  if (body.status !== undefined && !SETTABLE_STATUSES.has(body.status)) return jsonError("حالة الحملة غير صحيحة");
  if (body.name !== undefined && (!body.name.trim() || body.name.trim().length > 120)) return jsonError("اسم الحملة غير صحيح");

  try {
    const existing = await prisma.campaign.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) return jsonError("تعذر تحديث الحملة", 404);

    // Moving the send time of a scheduled campaign: a Riyadh wall-clock value from the page, in the future.
    let rescheduledTo: string | undefined;
    if (body.scheduledAt !== undefined && !body.sendNow) {
      if (existing.status !== "مجدولة") return jsonError("يمكن تعديل موعد الحملات المجدولة فقط");
      const when = parseRiyadhDateTime(body.scheduledAt);
      if (!when) return jsonError("موعد الإرسال غير صحيح");
      if (when.getTime() <= Date.now()) return jsonError("اختر موعداً في المستقبل");
      rescheduledTo = when.toISOString();
    }

    // Resuming a stopped campaign, or sending only the recipients that failed: both put recipients back in the queue.
    const resuming = body.status === "قيد الإرسال" && !body.sendNow && !body.retryFailed;
    if (body.status === "مؤرشفة" && existing.status === "قيد الإرسال") return jsonError("أوقف الحملة أولاً ثم أرشفها");
    if (body.retryFailed) {
      const approved = await prisma.template.findFirst({ where: { tenantId: user.tenantId, name: existing.templateName, status: "معتمد" } });
      if (!approved) return jsonError("قالب الحملة غير موجود أو غير معتمد من Meta", 400);
      const retried = await prisma.campaignRecipient.updateMany({
        where: { campaignId: id, tenantId: user.tenantId, status: "فشل الإرسال", NOT: { error: OPT_OUT_ERROR } },
        data: { status: "قيد الإرسال", error: "" }
      });
      if (!retried.count) return jsonError("لا يوجد مستلمون فاشلون يمكن إعادة الإرسال لهم", 400);
    }
    if (resuming || body.retryFailed) {
      const waiting = await prisma.campaignRecipient.count({ where: { campaignId: id, tenantId: user.tenantId, status: "قيد الإرسال" } });
      if (!waiting) return jsonError("لا يوجد جمهور ينتظر الإرسال في هذه الحملة", 400);
      const template = await prisma.template.findFirst({ where: { tenantId: user.tenantId, name: existing.templateName, status: "معتمد" } });
      if (!template) return jsonError("قالب الحملة غير موجود أو غير معتمد من Meta", 400);
    }

    if (body.sendNow) {
      const recipientCount = await prisma.campaignRecipient.count({
        where: { campaignId: id, tenantId: user.tenantId, status: { in: ["قيد الإرسال", "فشل الإرسال"] } }
      });
      if (!recipientCount) return jsonError("لا يوجد جمهور جاهز للإرسال في هذه الحملة", 400);

      const template = await prisma.template.findFirst({
        where: { tenantId: user.tenantId, name: existing.templateName, status: "معتمد" }
      });
      if (!template) return jsonError("قالب الحملة غير موجود أو غير معتمد من Meta", 400);

      await prisma.campaignRecipient.updateMany({
        where: { campaignId: id, tenantId: user.tenantId, status: "فشل الإرسال" },
        data: { status: "قيد الإرسال", error: "" }
      });
    }

    await prisma.campaign.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        name: body.name?.trim(),
        description: body.description === undefined ? undefined : body.description.trim().slice(0, 300),
        tags: body.tags === undefined ? undefined : parseCampaignTags(body.tags),
        status: body.sendNow || body.retryFailed ? "قيد الإرسال" : body.status,
        scheduledAt: body.sendNow ? "" : rescheduledTo,
        updatedAt: new Date().toISOString()
      }
    });
    const updated = await prisma.campaign.findFirst({ where: { id, tenantId: user.tenantId } });

    if (body.sendNow || body.retryFailed || resuming) {
      processCampaignBatch(user.tenantId, 300, { deadlineAt: Date.now() + 50_000 }).catch((error) => console.error("Campaign send-now batch failed", error));
    }
    return jsonOk(updated);
  } catch {
    return jsonError("تعذر تحديث الحملة", 404);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  try {
    const existing = await prisma.campaign.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) return jsonError("تعذر حذف الحملة", 404);

    await prisma.campaignRecipient.deleteMany({ where: { campaignId: id, tenantId: user.tenantId } });
    await prisma.campaign.deleteMany({ where: { id, tenantId: user.tenantId } });
    return jsonOk({ id });
  } catch {
    return jsonError("تعذر حذف الحملة", 404);
  }
}
