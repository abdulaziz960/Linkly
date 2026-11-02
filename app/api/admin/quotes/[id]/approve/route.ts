import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../../../lib/admin-audit";
import { isTrustedOrigin } from "../../../../../../lib/origin-guard";
import { provisionQuoteWorkspace } from "../../../../../../lib/quotes/provision";
import { approveQuoteOffline } from "../../../../../../lib/quotes/store";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

/** Records that the client approved the quote outside the platform (a draft goes straight to approved), then does what an approval does. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const result = await approveQuoteOffline((await params).id, admin.name);
  if (!result.ok) return jsonError(result.error, result.status);
  await recordAdminAction(admin, "approve-quote-offline", { type: "quote", id: result.quote.id }, JSON.stringify({ number: result.quote.number, linkedExisting: result.quote.linkedExisting }));
  // The approval stands even if the next step fails; the platform team sees why on the quote and can run it again.
  const next = await provisionQuoteWorkspace(result.quote.id, admin.name);
  return jsonOk({ quote: result.quote, warning: next.ok ? "" : next.error });
}
