import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../../../lib/admin-audit";
import { getAppOrigin } from "../../../../../../lib/app-url";
import { sendQuoteEmail } from "../../../../../../lib/email";
import { isTrustedOrigin } from "../../../../../../lib/origin-guard";
import { formatSar } from "../../../../../../lib/quotes/model";
import { getQuote, markQuoteSent } from "../../../../../../lib/quotes/store";
import { isValidEmail } from "../../../../../../lib/validation";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

/** Sends the quote to the client: it gets its link, and the link goes out by email. The link is also returned, in case the email cannot be sent. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id } = await params;
  const current = await getQuote(id);
  if (!current) return jsonError("عرض السعر غير موجود", 404);
  if (!current.email || !isValidEmail(current.email)) return jsonError("أدخل بريد العميل واحفظ العرض قبل الإرسال", 400);
  if (!current.lines.length || current.totalHalalas <= 0) return jsonError("لا يمكن إرسال عرض بإجمالي صفر", 400);

  const result = await markQuoteSent(id, admin.name);
  if (!result.ok) return jsonError(result.error, result.status);
  const quote = result.quote;
  const url = `${getAppOrigin(request)}/q/${quote.token}`;
  const emailSent = await sendQuoteEmail({
    to: quote.email, customerName: quote.customerName, contactName: quote.contactName, number: quote.number,
    totalLabel: formatSar(quote.totalHalalas), validUntil: quote.validUntil, url, quoteId: quote.id
  }).catch(() => false);
  await recordAdminAction(admin, "send-quote", { type: "quote", id: quote.id }, JSON.stringify({ number: quote.number, to: quote.email, emailSent }));
  return jsonOk({ quote, url, emailSent });
}
