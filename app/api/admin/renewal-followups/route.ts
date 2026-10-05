import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../lib/admin-auth";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { prisma } from "../../../../lib/prisma";
import { ensureSchema } from "../../../../lib/database";
import { isFollowUpStatus, setRenewalFollowUp } from "../../../../lib/renewal-followups";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function PUT(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("clients");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const body = (await request.json().catch(() => null)) as { tenantId?: unknown; status?: unknown } | null;
  if (!body || typeof body.tenantId !== "string" || !body.tenantId || body.tenantId.length > 100 || !isFollowUpStatus(body.status)) return jsonError("بيانات المتابعة غير صالحة", 400);

  await ensureSchema();
  const subscription = await prisma.subscription.findUnique({ where: { tenantId: body.tenantId }, select: { tenantId: true } });
  if (!subscription) return jsonError("العميل غير موجود", 404);
  return jsonOk(await setRenewalFollowUp(body.tenantId, body.status, admin.email));
}
