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
    where: { campaignId: id },
    orderBy: { createdAt: "asc" },
    take: 5000
  });

  return jsonOk(
    recipients.map((recipient) => ({
      phone: recipient.phone,
      name: recipient.name,
      status: recipient.status,
      error: recipient.error,
      date: recipient.sentAt || recipient.createdAt
    }))
  );
}
