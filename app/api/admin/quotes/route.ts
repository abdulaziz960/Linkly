import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../lib/admin-audit";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { createQuote, listQuotes } from "../../../../lib/quotes/store";
import { parseQuoteInput } from "../../../../lib/quotes/validate";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  return jsonOk(await listQuotes());
}

export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const parsed = parseQuoteInput(await request.json().catch(() => null));
  if (!parsed.ok) return jsonError(parsed.error, 400);
  if (parsed.input.existingTenantId && !(await prisma.subscription.findUnique({ where: { tenantId: parsed.input.existingTenantId }, select: { tenantId: true } }))) return jsonError("العميل المرتبط غير موجود", 400);
  const quote = await createQuote({ ...parsed.input, salesperson: parsed.input.salesperson || admin.name }, admin.name);
  await recordAdminAction(admin, "create-quote", { type: "quote", id: quote.id }, JSON.stringify({ number: quote.number, customer: quote.customerName, total: quote.totalHalalas }));
  return jsonOk(quote);
}
