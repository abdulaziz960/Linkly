import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { disconnectTikTokLeads, getTikTokLeadConnection, tiktokAdsConfigured } from "../../../../lib/tiktok-leads";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول", 403);
  const connection = await getTikTokLeadConnection(user.tenantId);
  return jsonOk({ configured: tiktokAdsConfigured(), connected: Boolean(connection), advertisers: connection?.advertiserIds.length ?? 0, connectedAt: connection?.connectedAt ?? "" });
}

export async function DELETE(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("فك الربط متاح لمالك الحساب فقط", 403);
  await disconnectTikTokLeads(user.tenantId);
  return jsonOk({ connected: false });
}
