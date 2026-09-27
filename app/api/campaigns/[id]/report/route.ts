import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { prisma } from "../../../../../lib/prisma";
import { jsonError, jsonOk } from "../../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const campaign = await prisma.campaign.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!campaign) return jsonError("الحملة غير موجودة", 404);

  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId: id, tenantId: user.tenantId },
    orderBy: { createdAt: "asc" },
    take: 5000
  });

  // Batched in one query rather than per-recipient, then grouped in memory -
  // most recipients never clicked at all, so this is typically small even
  // for a large campaign.
  const clicks = await prisma.campaignRecipientClick.findMany({
    where: { recipientId: { in: recipients.map((recipient) => recipient.id) } },
    orderBy: { clickedAt: "asc" }
  });
  const clicksByRecipientId = new Map<string, string[]>();
  for (const click of clicks) {
    const list = clicksByRecipientId.get(click.recipientId);
    if (list) list.push(click.clickedAt);
    else clicksByRecipientId.set(click.recipientId, [click.clickedAt]);
  }

  return jsonOk({
    linkTrackingEnabled: Boolean(campaign.linkTrackingEnabled),
    recipients: recipients.map((recipient) => ({
      phone: recipient.phone,
      name: recipient.name,
      status: recipient.status,
      error: recipient.error,
      date: recipient.sentAt || recipient.createdAt,
      readAt: recipient.readAt,
      clickedAt: recipient.clickedAt,
      clickCount: recipient.clickCount,
      // Empty for a click that happened before this log existed, even if
      // clickCount is > 0 for it - only ever backfilled going forward.
      clicks: clicksByRecipientId.get(recipient.id) || [],
      deliveryFailed: recipient.deliveryFailed
    }))
  });
}
