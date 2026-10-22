import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../../../lib/permissions-server";
import { isTrustedOrigin } from "../../../../../../../lib/origin-guard";
import { consumeRateLimit, requestIdentifier } from "../../../../../../../lib/rate-limit";
import { getSallaOrderDraft, updateSallaOrderAddress, type ShipTo } from "../../../../../../../lib/salla";
import { logAdminAction, getTenantCompanyName } from "../../../../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../../../../_utils/json";

export const runtime = "nodejs";

type Params = { params: Promise<{ store: string; id: string }> };

const SHIP_TO_KEYS: Array<keyof ShipTo> = ["name", "email", "phone", "country", "city", "address_line", "street_number", "block", "short_address", "building_number", "additional_number", "postal_code", "lat", "lng"];

async function authorize(request: NextRequest, store: string, write: boolean) {
  if (store !== "salla") return { error: jsonError("تعديل الطلبات متاح لسلة فقط حاليًا", 404) };
  if (write && !isTrustedOrigin(request)) return { error: jsonError("الطلب مرفوض (مصدر غير موثوق)", 403) };
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("يلزم تسجيل الدخول", 401) };
  if (!(await userHasViewPermission(user, "integrations"))) return { error: jsonError("لا تملك صلاحية الوصول", 403) };
  return { user };
}

/** The recipient and delivery address of the order, as Salla has them now. */
export async function GET(request: NextRequest, { params }: Params) {
  const { store, id } = await params;
  const auth = await authorize(request, store, false);
  if (auth.error) return auth.error;
  const result = await getSallaOrderDraft(auth.user.tenantId, id);
  if (!result.ok || !result.draft) {
    if (result.status === 401 || result.status === 403) return jsonError("صلاحيات الربط ناقصة: أعد ربط متجر سلة ووافق على صلاحية الطلبات.", 400);
    return jsonError(result.status === 400 ? "رقم الطلب غير صالح" : "تعذر جلب بيانات الطلب من سلة", result.status === 400 ? 400 : 502);
  }
  return jsonOk({ shipTo: result.draft.shipTo, missing: result.draft.missing });
}

/** Saves a corrected recipient / address in Salla. */
export async function PUT(request: NextRequest, { params }: Params) {
  const { store, id } = await params;
  const auth = await authorize(request, store, true);
  if (auth.error) return auth.error;
  const { user } = auth;

  const limit = await consumeRateLimit("store-order-edit", requestIdentifier(request, user.id), 40, 10 * 60 * 1000);
  if (!limit.allowed) return jsonError("محاولات كثيرة. حاول مرة أخرى بعد قليل", 429);

  const body = (await request.json().catch(() => null)) as { shipTo?: Partial<Record<keyof ShipTo, string>>; reference?: string } | null;
  const shipTo = {} as ShipTo;
  for (const key of SHIP_TO_KEYS) shipTo[key] = String(body?.shipTo?.[key] ?? "").trim().slice(0, 300);
  const missing = (["name", "phone", "country", "city", "address_line"] as Array<keyof ShipTo>).filter((key) => !shipTo[key]);
  if (missing.length) return jsonError(`أكمل البيانات: ${missing.join("، ")}`);

  const result = await updateSallaOrderAddress(user.tenantId, id, shipTo);
  if (!result.ok) return jsonError(result.error, result.status >= 500 ? 502 : 400);

  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم تعديل عنوان ومستلم طلب سلة ${body?.reference || id} بواسطة ${user.name}.`, "معلومة", "المتجر");
  return jsonOk({ id });
}
