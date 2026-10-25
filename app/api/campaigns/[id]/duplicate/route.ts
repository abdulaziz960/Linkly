import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { prisma } from "../../../../../lib/prisma";
import { spawnCampaignOccurrence } from "../../../../../lib/campaign-engine";
import { getCampaigns } from "../../../../../lib/database";
import { jsonError, jsonOk } from "../../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

/** A copy of a campaign with the same template, audience and settings, saved unsent so it can be reviewed first. */
export async function POST(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const source = await prisma.campaign.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!source) return jsonError("الحملة غير موجودة", 404);
  const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId: id, tenantId: user.tenantId }, select: { phone: true, name: true } });
  if (!recipients.length) return jsonError("لا يوجد جمهور لنسخه من هذه الحملة", 400);

  const copyName = `${source.name} (نسخة)`.slice(0, 120);
  const newId = await prisma.$transaction((tx) => spawnCampaignOccurrence(tx, {
    tenantId: user.tenantId,
    name: copyName,
    templateName: source.templateName,
    language: source.language,
    headerMediaDataUrl: source.headerMediaDataUrl,
    recipients,
    status: "مجدولة",
    linkTrackingEnabled: Boolean(source.linkTrackingEnabled),
    destinationUrl: source.destinationUrl,
    description: source.description,
    tags: source.tags
  }));

  const campaign = (await getCampaigns(user.tenantId)).find((item) => item.id === newId);
  return jsonOk(campaign);
}
