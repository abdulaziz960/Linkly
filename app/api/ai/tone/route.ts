import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { getAiTone, saveAiTone } from "../../../../lib/ai-tone";
import { isAiTone } from "../../../../lib/ai-tone-options";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

/** How the workspace's assistant speaks to customers (formal, Saudi colloquial...). Owner only, like the other AI settings. */
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("إعدادات المساعد متاحة لمالك الحساب", 403);
  const body = await request.json().catch(() => null);
  if (!body || !isAiTone(body.tone)) return jsonError("أسلوب الرد غير صالح", 400);
  await saveAiTone(user.tenantId, body.tone);
  return jsonOk({ tone: await getAiTone(user.tenantId) });
}
