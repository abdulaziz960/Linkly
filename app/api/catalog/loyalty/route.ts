import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { cleanLoyaltySettings, getLoyaltySettings, listLoyalty, resetLoyaltyCycle, saveLoyaltySettings } from "../../../../lib/loyalty";
import { prisma } from "../../../../lib/prisma";
import { ensureSchema } from "../../../../lib/database";
import { logAdminAction, getTenantCompanyName } from "../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

async function authorize(request: NextRequest | null) {
  if (request && !isTrustedOrigin(request)) return { error: jsonError("الطلب مرفوض (مصدر غير موثوق)", 403) };
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("غير مصرح", 401) };
  if (!(await userHasViewPermission(user, "catalog"))) return { error: jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403) };
  return { user };
}

/** The loyalty program, its customers' progress, the rewards given and the products a free-product reward can use. */
export async function GET() {
  const auth = await authorize(null);
  if (auth.error) return auth.error;
  await ensureSchema();
  const [settings, stats, products] = await Promise.all([
    getLoyaltySettings(auth.user.tenantId),
    listLoyalty(auth.user.tenantId),
    prisma.product.findMany({ where: { tenantId: auth.user.tenantId, active: 1 }, select: { id: true, name: true, price: true }, orderBy: { name: "asc" }, take: 200 })
  ]);
  return jsonOk({ settings, ...stats, products });
}

export async function PUT(request: NextRequest) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object") return jsonError("طلب غير صالح", 400);
  const wanted = cleanLoyaltySettings(body);
  if (wanted.enabled && wanted.rewardKind === "free_product") {
    const product = wanted.productId ? await prisma.product.findFirst({ where: { id: wanted.productId, tenantId: auth.user.tenantId, active: 1 }, select: { id: true } }) : null;
    if (!product) return jsonError("اختر منتجًا نشطًا للمكافأة المجانية", 400);
  }
  const settings = await saveLoyaltySettings(auth.user.tenantId, wanted);
  await logAdminAction(auth.user.tenantId, await getTenantCompanyName(auth.user.tenantId), `تم تحديث برنامج الولاء (${settings.enabled ? "مفعّل" : "متوقف"}، ${settings.goal} طلبات) بواسطة ${auth.user.name}.`, "معلومة", "الكتالوج");
  return jsonOk(settings);
}

/** Starts a customer's current cycle over. */
export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { phone?: string } | null;
  const phone = String(body?.phone ?? "").trim();
  if (!/^\d{9,15}$/.test(phone)) return jsonError("رقم غير صالح", 400);
  await resetLoyaltyCycle(auth.user.tenantId, phone);
  return jsonOk({ phone });
}
