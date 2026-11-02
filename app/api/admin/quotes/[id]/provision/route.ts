import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../../../lib/admin-audit";
import { isTrustedOrigin } from "../../../../../../lib/origin-guard";
import { provisionQuoteWorkspace } from "../../../../../../lib/quotes/provision";
import { getQuote, recordQuoteEvent, setQuoteEmail } from "../../../../../../lib/quotes/store";
import { isValidEmail } from "../../../../../../lib/validation";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

/** إنشاء المساحة لعرض سعر معتمد. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id } = await params;
  // The owner's email can be corrected here (the one on the quote may already belong to another account).
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email) {
    if (!isValidEmail(email)) return jsonError("البريد الإلكتروني غير صحيح", 400);
    const current = await getQuote(id);
    if (current && current.email !== email && !current.tenantId) {
      await setQuoteEmail(id, email);
      await recordQuoteEvent(id, "email_changed", admin.name, `${current.email} → ${email}`);
    }
  }
  const result = await provisionQuoteWorkspace(id, admin.name);
  if (!result.ok) return jsonError(result.error, result.status);
  const quote = await getQuote(id);
  await recordAdminAction(admin, "provision-quote", { type: "quote", id }, JSON.stringify({ number: quote?.number, tenantId: result.tenantId }));
  return jsonOk({ quote });
}
