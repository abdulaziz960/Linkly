import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../../../lib/admin-audit";
import { isTrustedOrigin } from "../../../../../../lib/origin-guard";
import { isSallaBilled } from "../../../../../../lib/salla-billing";
import { isShopifyBilled } from "../../../../../../lib/shopify-billing";
import { clearScheduledPlan, getScheduledPlan, setScheduledPlan } from "../../../../../../lib/scheduled-plan";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

/** The plan and cycle scheduled for the client's next renewal (null when none). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin("clients");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id } = await params;
  return jsonOk(await getScheduledPlan(id));
}

/** { planName, billingCycle }: from the next renewal the client is charged on that plan and cycle. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("clients");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { planName?: unknown; billingCycle?: unknown } | null;
  if (!body) return jsonError("طلب غير صالح", 400);
  // Salla / Shopify bill their own subscribers: the plan there is set on their platform.
  if ((await isSallaBilled(id)) || (await isShopifyBilled(id))) return jsonError("هذا العميل يُفوتر عبر سلة أو شوبيفاي، وتُغيَّر باقته من هناك.", 400);
  const saved = await setScheduledPlan(id, { planName: String(body.planName ?? ""), billingCycle: String(body.billingCycle ?? "") }, admin.name);
  if (!saved.ok) return jsonError(saved.error, 400);
  await recordAdminAction(admin, "schedule-client-plan", { type: "tenant", id }, JSON.stringify({ plan: saved.scheduled.planName, cycle: saved.scheduled.billingCycle }));
  return jsonOk(saved.scheduled);
}

/** Cancels the scheduled change: the renewal stays on the current plan. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("clients");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id } = await params;
  await clearScheduledPlan(id);
  await recordAdminAction(admin, "cancel-scheduled-client-plan", { type: "tenant", id }, "");
  return jsonOk(null);
}
