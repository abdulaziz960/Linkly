import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../../../lib/admin-audit";
import { isTrustedOrigin } from "../../../../../../lib/origin-guard";
import { cancelQuote } from "../../../../../../lib/quotes/store";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const result = await cancelQuote((await params).id, admin.name);
  if (!result.ok) return jsonError(result.error, result.status);
  await recordAdminAction(admin, "cancel-quote", { type: "quote", id: result.quote.id }, JSON.stringify({ number: result.quote.number }));
  return jsonOk(result.quote);
}
