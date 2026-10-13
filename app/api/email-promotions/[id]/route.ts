import { NextRequest } from "next/server";
import crypto from "crypto";
import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { ensureEmailPromotionsSchema } from "../../../../lib/email-promotions-schema";
import { listEmailCampaigns, processEmailCampaignBatch, resolveEmailRecipients, validateEmailCampaignInput } from "../../../../lib/email-promotions";
import { jsonError, jsonOk } from "../../_utils/json";
import { emailHtmlToText, sanitizeEmailHtml } from "../../../../lib/email-html";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  await ensureEmailPromotionsSchema();
  const { id } = await params;
  const body = await request.json().catch(() => null) as { status?: string; name?: string; subject?: string; senderName?: string; senderEmail?: string; bodyHtml?: string; ctaText?: string; ctaUrl?: string; audience?: { mode: "all" | "tag" | "status" | "channel" | "custom"; tagNames?: string[]; conversationStatus?: string; channel?: string; customerIds?: string[] }; scheduledAt?: string } | null;
  const campaign = await prisma.emailCampaign.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!campaign) return jsonError("الحملة غير موجودة", 404);
  if (body?.name !== undefined) {
    if (campaign.status !== "draft" && campaign.status !== "scheduled") return jsonError("يمكن تعديل المسودات أو الحملات المجدولة فقط");
    const input = {
      name: String(body.name || ""),
      subject: String(body.subject || ""),
      senderName: String(body.senderName || ""),
      senderEmail: String(body.senderEmail || ""),
      bodyHtml: String(body.bodyHtml || ""),
      ctaText: String(body.ctaText || ""),
      ctaUrl: String(body.ctaUrl || ""),
      audience: body.audience || { mode: "all" as const },
      scheduledAt: String(body.scheduledAt || ""),
      saveDraft: campaign.status === "draft"
    };
    const validationError = validateEmailCampaignInput(input);
    if (validationError) return jsonError(validationError);
    const recipients = await resolveEmailRecipients(user.tenantId, input.audience);
    const updatedAt = new Date().toISOString();
    await prisma.$transaction(async (tx) => {
      await tx.emailCampaign.update({
        where: { id },
        data: {
          name: input.name.trim(),
          subject: input.subject.trim(),
          senderName: input.senderName.trim(),
          senderEmail: input.senderEmail.trim().toLowerCase(),
          bodyHtml: sanitizeEmailHtml(input.bodyHtml).trim(),
          bodyText: emailHtmlToText(input.bodyHtml),
          ctaText: input.ctaText.trim(),
          ctaUrl: input.ctaUrl.trim(),
          audienceMode: input.audience.mode,
          audienceJson: JSON.stringify(input.audience),
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt).toISOString() : "",
          totalRecipients: recipients.length,
          updatedAt
        }
      });
      await tx.emailCampaignRecipient.deleteMany({ where: { campaignId: id, tenantId: user.tenantId, status: "pending" } });
      if (recipients.length) {
        await tx.emailCampaignRecipient.createMany({
          data: recipients.map((recipient) => ({
            id: `email-recipient-${crypto.randomUUID()}`,
            campaignId: id,
            tenantId: user.tenantId,
            customerId: recipient.customerId,
            email: recipient.email,
            name: recipient.name,
            status: "pending",
            createdAt: updatedAt
          }))
        });
      }
    });
  } else if (body?.status === "sending") {
    if (campaign.status !== "scheduled" && campaign.status !== "draft") return jsonError("لا يمكن إرسال هذه الحملة من حالتها الحالية");
    await prisma.emailCampaign.update({ where: { id }, data: { status: "sending", scheduledAt: "", updatedAt: new Date().toISOString() } });
    processEmailCampaignBatch(user.tenantId).catch((error) => console.error("Email campaign send-now failed", error));
  } else if (body?.status === "cancelled") {
    if (campaign.status !== "scheduled" && campaign.status !== "draft") return jsonError("يمكن إلغاء المسودات أو المجدولة فقط");
    await prisma.emailCampaign.update({ where: { id }, data: { status: "cancelled", updatedAt: new Date().toISOString() } });
  } else {
    return jsonError("الإجراء غير مدعوم");
  }
  return jsonOk(await listEmailCampaigns(user.tenantId));
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  await ensureEmailPromotionsSchema();
  const { id } = await params;
  const campaign = await prisma.emailCampaign.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!campaign) return jsonError("الحملة غير موجودة", 404);
  if (campaign.status === "sending") return jsonError("لا يمكن حذف حملة قيد الإرسال");
  await prisma.$transaction([
    prisma.emailCampaignRecipient.deleteMany({ where: { campaignId: id, tenantId: user.tenantId } }),
    prisma.emailCampaign.delete({ where: { id } })
  ]);
  return jsonOk(await listEmailCampaigns(user.tenantId));
}
