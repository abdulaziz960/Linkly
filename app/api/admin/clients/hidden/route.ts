import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { setClientsHidden } from "../../../../../lib/admin-hidden-clients";
import { getSubscriptions } from "../../../../../lib/subscriptions";
import { recordAdminAction } from "../../../../../lib/admin-audit";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

/** `{ tenantIds: string[], hidden: boolean }` - hides/shows clients in the admin panel only. Never deletes or suspends anything. */
export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);

  const admin = await requirePlatformAdmin("clients");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const body = (await request.json().catch(() => null)) as { tenantIds?: unknown; hidden?: unknown } | null;
  const tenantIds = Array.isArray(body?.tenantIds) ? body.tenantIds.filter((id): id is string => typeof id === "string") : [];
  if (!tenantIds.length || typeof body?.hidden !== "boolean") return jsonError("حدد العملاء وحالة الإخفاء");
  if (tenantIds.length > 200) return jsonError("الحد الأقصى 200 عميل في المرة الواحدة");

  // Only real workspaces: an unknown id is ignored rather than stored.
  const known = new Set((await getSubscriptions()).map((subscription) => subscription.tenantId));
  const valid = tenantIds.filter((id) => known.has(id));
  if (!valid.length) return jsonError("لم يتم العثور على العملاء", 404);

  const count = await setClientsHidden(valid, body.hidden, admin.name);
  await recordAdminAction(admin, body.hidden ? "hide-clients" : "unhide-clients", { type: "tenant", id: valid.join(",") }, JSON.stringify({ subject: `${count} عميل`, count }));
  return jsonOk({ count });
}
