import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { cleanAmount, closeShift, getOpenShift, listRecentShifts, openShift, shiftSummary } from "../../../../lib/catalog-shifts";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

async function authorize(request: NextRequest | null) {
  if (request && !isTrustedOrigin(request)) return { error: jsonError("الطلب مرفوض (مصدر غير موثوق)", 403) };
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("غير مصرح", 401) };
  if (!(await userHasViewPermission(user, "catalog"))) return { error: jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403) };
  return { user };
}

async function state(tenantId: string) {
  const open = await getOpenShift(tenantId);
  const live = open ? await shiftSummary(tenantId, open) : null;
  return { open, live: live ? { sales: live.report.sales, orderCount: live.report.orderCount, cashToCollect: live.report.followUp.total, expectedCash: live.expectedCash, paidOnline: live.report.paid } : null, recent: await listRecentShifts(tenantId) };
}

export async function GET() {
  const auth = await authorize(null);
  if (auth.error) return auth.error;
  return jsonOk(await state(auth.user.tenantId));
}

/** { action: "open", amount } or { action: "close", amount, note } - amount is the cash in the drawer / the cash counted. */
export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { action?: unknown; amount?: unknown; note?: unknown } | null;
  const amount = cleanAmount(body?.amount);
  if (amount === null) return jsonError("اكتب مبلغًا صحيحًا", 400);
  if (body?.action === "open") {
    const result = await openShift(auth.user.tenantId, auth.user.name, amount);
    if (!result.ok) return jsonError(result.error, 400);
  } else if (body?.action === "close") {
    const result = await closeShift(auth.user.tenantId, auth.user.name, amount, String(body.note ?? ""));
    if (!result.ok) return jsonError(result.error, 400);
  } else {
    return jsonError("طلب غير صالح", 400);
  }
  return jsonOk(await state(auth.user.tenantId));
}
