import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../../../lib/admin-audit";
import { isTrustedOrigin } from "../../../../../../lib/origin-guard";
import { getTaxProfile, saveTaxProfile } from "../../../../../../lib/tax-profile";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

/** A client's VAT number and address for the invoices Linkly issues to it (read). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id } = await params;
  return jsonOk(await getTaxProfile(id));
}

/** Sets them from the admin panel ({ vatNumber, address }); an empty number clears it. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { vatNumber?: unknown; address?: unknown } | null;
  if (!body) return jsonError("طلب غير صالح", 400);
  const saved = await saveTaxProfile(id, body);
  if (!saved.ok) return jsonError(saved.error, 400);
  await recordAdminAction(admin, "update-client-tax-profile", { type: "tenant", id }, JSON.stringify({ vatNumber: saved.profile.vatNumber ? "set" : "cleared", address: saved.profile.address ? "set" : "empty" }));
  return jsonOk(saved.profile);
}
