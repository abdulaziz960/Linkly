import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { prisma } from "../../../../lib/prisma";
import { processCampaignBatch } from "../../../../lib/campaign-engine";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json()) as { name?: string; status?: string; sendNow?: boolean };

  try {
    const existing = await prisma.campaign.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) return jsonError("تعذر تحديث الحملة", 404);

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
        status: body.sendNow ? "قيد الإرسال" : body.status,
        scheduledAt: body.sendNow ? "" : undefined,
        updatedAt: new Date().toLocaleString("en-US")
      }
    });
    const updated = await prisma.campaign.findFirst({ where: { id, tenantId: user.tenantId } });

    if (body.sendNow) {
      processCampaignBatch(user.tenantId).catch((error) => console.error("Campaign send-now batch failed", error));
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
