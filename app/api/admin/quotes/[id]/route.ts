import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../../lib/admin-audit";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";
import { getQuote, listQuoteEvents, updateQuote } from "../../../../../lib/quotes/store";
import { parseQuoteInput } from "../../../../../lib/quotes/validate";
import { prisma } from "../../../../../lib/prisma";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const quote = await getQuote((await params).id);
  if (!quote) return jsonError("عرض السعر غير موجود", 404);
  return jsonOk({ quote, events: await listQuoteEvents(quote.id) });
}

export async function PUT(request: NextRequest, { params }: Context) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const parsed = parseQuoteInput(await request.json().catch(() => null));
  if (!parsed.ok) return jsonError(parsed.error, 400);
  if (parsed.input.existingTenantId && !(await prisma.subscription.findUnique({ where: { tenantId: parsed.input.existingTenantId }, select: { tenantId: true } }))) return jsonError("العميل المرتبط غير موجود", 400);
  const result = await updateQuote((await params).id, parsed.input, admin.name);
  if (!result.ok) return jsonError(result.error, result.status);
  await recordAdminAction(admin, "update-quote", { type: "quote", id: result.quote.id }, JSON.stringify({ number: result.quote.number, total: result.quote.totalHalalas }));
  return jsonOk(result.quote);
}
