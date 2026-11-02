import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";
import { consumeRateLimit, requestIdentifier } from "../../../../../lib/rate-limit";
import { draftQuoteContent } from "../../../../../lib/quotes/ai";
import { listQuoteServices } from "../../../../../lib/quotes/store";
import { parseQuoteInput } from "../../../../../lib/quotes/validate";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

/** The cover and the terms for the services picked so far (written by the model when one is configured, from the services' own notes otherwise). */
export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const limit = await consumeRateLimit("quote-ai", requestIdentifier(request, admin.id), 20, 60_000);
  if (!limit.allowed) return jsonError("محاولات كثيرة. حاول مرة أخرى بعد قليل", 429);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  // Only the services and what was asked of them matter here, so a draft without customer details is still accepted.
  const parsed = parseQuoteInput({ ...(body ?? {}), customerName: typeof body?.customerName === "string" && body.customerName.trim().length >= 2 ? body.customerName : "العميل" });
  if (!parsed.ok) return jsonError(parsed.error, 400);
  const content = await draftQuoteContent({ customerName: parsed.input.customerName, billingCycle: parsed.input.billingCycle, lines: parsed.input.lines, services: await listQuoteServices(true) });
  return jsonOk(content);
}
