import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { getTaxProfile, saveTaxProfile } from "../../../../lib/tax-profile";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

/** The workspace's own tax details for its invoices (owner only). */
export async function GET() {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) return jsonError("غير مصرح", 401);
  if (user.role !== "مالك الحساب") return jsonError("متاح لمالك الحساب فقط", 403);
  return jsonOk(await getTaxProfile(user.tenantId));
}

export async function PUT(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) return jsonError("غير مصرح", 401);
  if (user.role !== "مالك الحساب") return jsonError("متاح لمالك الحساب فقط", 403);
  const body = (await request.json().catch(() => null)) as { vatNumber?: unknown; address?: unknown } | null;
  if (!body) return jsonError("طلب غير صالح", 400);
  const saved = await saveTaxProfile(user.tenantId, body);
  if (!saved.ok) return jsonError(saved.error, 400);
  return jsonOk(saved.profile);
}
