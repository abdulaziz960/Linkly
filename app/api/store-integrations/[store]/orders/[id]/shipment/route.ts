import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../../../lib/permissions-server";
import { isTrustedOrigin } from "../../../../../../../lib/origin-guard";
import { consumeRateLimit, requestIdentifier } from "../../../../../../../lib/rate-limit";
import { buildShipmentPayload, createSallaShipment, prepareSallaShipment, type ShipTo, type ShipmentPackage } from "../../../../../../../lib/salla";
import { logAdminAction, getTenantCompanyName } from "../../../../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../../../../_utils/json";

export const runtime = "nodejs";

type Params = { params: Promise<{ store: string; id: string }> };

const SHIP_TO_KEYS: Array<keyof ShipTo> = ["name", "email", "phone", "country", "city", "address_line", "street_number", "block", "short_address", "building_number", "additional_number", "postal_code", "lat", "lng"];

async function authorize(request: NextRequest, store: string, write: boolean) {
  if (store !== "salla") return { error: jsonError("الشحن متاح لسلة فقط حاليًا", 404) };
  if (write && !isTrustedOrigin(request)) return { error: jsonError("الطلب مرفوض (مصدر غير موثوق)", 403) };
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("يلزم تسجيل الدخول", 401) };
  if (!(await userHasViewPermission(user, "integrations"))) return { error: jsonError("لا تملك صلاحية الوصول", 403) };
  return { user };
}

/** Draft shipment for an order: the store's active shipping companies, branches and the address taken from the order. */
export async function GET(request: NextRequest, { params }: Params) {
  const { store, id } = await params;
  const auth = await authorize(request, store, false);
  if (auth.error) return auth.error;
  const prepared = await prepareSallaShipment(auth.user.tenantId, id);
  if (!prepared.ok || !prepared.draft) {
    if (prepared.status === 401 || prepared.status === 403) return jsonError("صلاحيات الربط ناقصة: أعد ربط متجر سلة ووافق على صلاحيتي الطلبات والشحن.", 400);
    return jsonError(prepared.status === 400 ? "رقم الطلب غير صالح" : "تعذر جلب بيانات الطلب من سلة", prepared.status === 400 ? 400 : 502);
  }
  return jsonOk({ draft: prepared.draft, companies: prepared.companies, branches: prepared.branches });
}

/** Creates the shipment in Salla with the courier and address the employee confirmed. */
export async function POST(request: NextRequest, { params }: Params) {
  const { store, id } = await params;
  const auth = await authorize(request, store, true);
  if (auth.error) return auth.error;
  const { user } = auth;

  const limit = await consumeRateLimit("store-shipment", requestIdentifier(request, user.id), 30, 10 * 60 * 1000);
  if (!limit.allowed) return jsonError("محاولات كثيرة. حاول مرة أخرى بعد قليل", 429);

  const body = (await request.json().catch(() => null)) as { courierId?: string; branchId?: string; paymentMethod?: string; shipTo?: Partial<Record<keyof ShipTo, string>>; packages?: ShipmentPackage[]; reference?: string } | null;
  const courierId = String(body?.courierId ?? "").trim();
  if (!/^\d+$/.test(courierId)) return jsonError("اختر شركة الشحن");
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return jsonError("رقم الطلب غير صالح");
  const paymentMethod = body?.paymentMethod === "cod" ? "cod" : "pre_paid";
  const shipTo = {} as ShipTo;
  for (const key of SHIP_TO_KEYS) shipTo[key] = String(body?.shipTo?.[key] ?? "").trim().slice(0, 300);
  const missing = (["name", "phone", "country", "city", "address_line"] as Array<keyof ShipTo>).filter((key) => !shipTo[key]);
  if (missing.length) return jsonError(`أكمل بيانات المستلم: ${missing.join("، ")}`);
  const packages = (Array.isArray(body?.packages) ? body.packages : []).slice(0, 100).map((item) => ({
    name: String(item.name ?? "منتج").slice(0, 200),
    sku: String(item.sku ?? "").slice(0, 100),
    price: Number(item.price) || 0,
    quantity: Math.max(1, Math.floor(Number(item.quantity)) || 1),
    weight: Number(item.weight) > 0 ? Number(item.weight) : 1
  }));
  if (!packages.length) return jsonError("لا توجد منتجات في الشحنة");

  const payload = buildShipmentPayload({ courierId, orderId: id, paymentMethod, shipTo, packages, branchId: body?.branchId && /^\d+$/.test(body.branchId) ? body.branchId : undefined });
  const result = await createSallaShipment(user.tenantId, payload);
  if (!result.ok) return jsonError(result.error, result.status >= 500 ? 502 : 400);

  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم إنشاء شحنة لطلب سلة ${body?.reference || id} بواسطة ${user.name}.`, "معلومة", "المتجر");
  return jsonOk(result.shipment);
}
