import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { getTenantIntegrationId } from "../../../../../lib/database";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { prisma } from "../../../../../lib/prisma";
import { getTenantCompanyName, logAdminAction } from "../../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

const LABELS = { meta_leads: "نماذج ميتا", snapchat: "سناب شات", tiktok: "تيك توك" } as const;
type DisconnectChannel = keyof typeof LABELS;

/** Unlinks an ad platform: forgets its tokens and stops lead intake until it is connected again. */
export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json().catch(() => null)) as { channel?: unknown } | null;
  const channel = typeof body?.channel === "string" && body.channel in LABELS ? (body.channel as DisconnectChannel) : null;
  if (!channel) return jsonError("قناة غير معروفة", 400);

  const updatedAt = new Date().toISOString();
  await prisma.integrationSetting.updateMany({
    where: { id: getTenantIntegrationId(channel, user.tenantId), tenantId: user.tenantId },
    data: {
      status: "pending",
      accessToken: "",
      leadAdsEnabled: 0,
      updatedAt,
      ...(channel === "snapchat"
        ? { snapchatRefreshToken: "", snapchatTokenExpiresAt: "", snapchatAdAccountId: "", snapchatOrganizationId: "", snapchatOrgName: "" }
        : {})
    }
  });

  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم فك ربط ${LABELS[channel]} بواسطة ${user.name}.`, "معلومة", "الإعدادات").catch(() => null);
  return jsonOk({ status: "pending" });
}
