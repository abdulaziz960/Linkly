import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { getIntegrationSettings } from "../../../../lib/database";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { prisma } from "../../../../lib/prisma";
import { listSnapchatAdAccounts } from "../../../../lib/snapchat";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

/** The workspace's ad accounts on Snapchat and which one is selected for leads. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول", 403);

  const settings = await getIntegrationSettings("snapchat", user.tenantId);
  if (settings.status !== "connected") return jsonError("اربط حساب سناب شات أولًا", 400);
  try {
    const accounts = await listSnapchatAdAccounts(settings);
    return jsonOk({ accounts, selectedId: settings.snapchatAdAccountId || "" });
  } catch (error) {
    console.error("Snapchat ad accounts lookup failed", error);
    return jsonError("تعذر جلب الحسابات الإعلانية من سناب. أعد المحاولة أو أعد ربط الحساب.", 502);
  }
}

export async function PUT(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("اختيار الحساب الإعلاني متاح لمالك الحساب فقط", 403);

  const body = (await request.json().catch(() => null)) as { adAccountId?: unknown } | null;
  const adAccountId = typeof body?.adAccountId === "string" ? body.adAccountId.trim() : "";
  if (!adAccountId) return jsonError("اختر حسابًا إعلانيًا", 400);

  const settings = await getIntegrationSettings("snapchat", user.tenantId);
  if (settings.status !== "connected") return jsonError("اربط حساب سناب شات أولًا", 400);

  let accounts;
  try {
    accounts = await listSnapchatAdAccounts(settings);
  } catch {
    return jsonError("تعذر التحقق من الحساب لدى سناب. أعد المحاولة.", 502);
  }
  // Only an account the connected member can actually reach may be selected.
  const chosen = accounts.find((account) => account.id === adAccountId);
  if (!chosen) return jsonError("هذا الحساب الإعلاني غير متاح لحسابك في سناب", 400);

  await prisma.integrationSetting.updateMany({
    where: { id: settings.id, tenantId: user.tenantId },
    data: {
      snapchatAdAccountId: chosen.id,
      snapchatOrganizationId: chosen.organizationId,
      snapchatOrgName: chosen.organizationName || chosen.name,
      businessName: chosen.organizationName || chosen.name,
      updatedAt: new Date().toISOString()
    }
  });
  return jsonOk({ selectedId: chosen.id });
}
