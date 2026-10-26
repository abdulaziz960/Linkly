import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { listEmailCampaigns } from "../../../../lib/segments-email";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

/** Email campaigns with their analytics for the Segments page (read-only: unlike /api/email-promotions it never triggers sending). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "segments"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  const campaigns = await listEmailCampaigns(user.tenantId);
  return jsonOk(campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name, status: campaign.status, scheduledAt: campaign.scheduledAt, createdAt: campaign.createdAt, updatedAt: campaign.updatedAt, analytics: campaign.analytics })));
}
