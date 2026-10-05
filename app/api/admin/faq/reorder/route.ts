import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../../lib/admin-audit";
import { reorderFaqItems } from "../../../../../lib/faq-store";
import { jsonError, jsonOk } from "../../../_utils/json";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";

export const runtime = "nodejs";

/** `{ ids: [...] }` - the new order, first to last. */
export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);

  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  if (!body || !Array.isArray(body.ids)) return jsonError("بيانات غير صالحة", 400);
  await reorderFaqItems(body.ids.filter((id): id is string => typeof id === "string").slice(0, 200));
  await recordAdminAction(admin, "reorder-faq", { type: "faq", id: "all" }, "");
  return jsonOk({ ok: true });
}
