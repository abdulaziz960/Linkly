import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";
import { consumeRateLimit, requestIdentifier } from "../../../../../lib/rate-limit";
import { SALLA_PAYMENT_METHODS, buildNewOrderPayload, createSallaOrder, listSallaOrders, listSallaStatuses, type SallaPaymentMethod } from "../../../../../lib/salla";
import { logAdminAction, getTenantCompanyName } from "../../../../../lib/subscriptions";
import { orderLinkText, sendOrderLinkOnWhatsApp, type OrderLinkResult } from "../../../../../lib/salla-order-link";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

type Params = { params: Promise<{ store: string }> };

/** Recent orders of the connected store with the statuses they can move to (Salla only for now). */
export async function GET(request: NextRequest, { params }: Params) {
  const { store } = await params;
  if (store !== "salla") return jsonError("إدارة الطلبات متاحة لسلة فقط حاليًا", 404);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "integrations"))) return jsonError("لا تملك صلاحية الوصول", 403);

  const page = Number(request.nextUrl.searchParams.get("page")) || 1;
  const [listed, statuses] = await Promise.all([listSallaOrders(user.tenantId, page), listSallaStatuses(user.tenantId)]);
  if (!listed.ok) {
    if (listed.status === 401) return jsonError("متجر سلة غير مربوط أو انتهت صلاحية الربط. اربط المتجر من تبويب الربط.", 400);
    if (listed.status === 403) return jsonError("صلاحيات الربط ناقصة: أعد ربط متجر سلة ووافق على صلاحية الطلبات.", 400);
    return jsonError("تعذر جلب الطلبات من سلة", 502);
  }
  return jsonOk({ orders: listed.orders, statuses });
}

/** Creates an order in Salla that the customer pays through Salla's payment link. */
export async function POST(request: NextRequest, { params }: Params) {
  const { store } = await params;
  if (store !== "salla") return jsonError("إنشاء الطلبات متاح لسلة فقط حاليًا", 404);
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "integrations"))) return jsonError("لا تملك صلاحية الوصول", 403);

  const limit = await consumeRateLimit("store-order-create", requestIdentifier(request, user.id), 30, 10 * 60 * 1000);
  if (!limit.allowed) return jsonError("محاولات كثيرة. حاول مرة أخرى بعد قليل", 429);

  const body = (await request.json().catch(() => null)) as {
    customer?: { name?: string; mobile?: string; email?: string };
    products?: Array<{ id?: string; quantity?: number }>;
    acceptedMethods?: string[];
    delivery?: { method?: string; branchId?: string };
    couponCode?: string;
    sendWhatsApp?: boolean;
  } | null;
  const customer = { name: String(body?.customer?.name ?? "").trim().slice(0, 120), mobile: String(body?.customer?.mobile ?? "").trim().slice(0, 30), email: String(body?.customer?.email ?? "").trim().slice(0, 200) };
  if (!customer.name || !customer.email || !/^\+?\d{8,15}$/.test(customer.mobile.replace(/[\s-]/g, ""))) return jsonError("أكمل بيانات العميل: الاسم والجوال والبريد الإلكتروني");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) return jsonError("البريد الإلكتروني غير صالح");
  const products = (Array.isArray(body?.products) ? body.products : []).slice(0, 50).map((item) => ({ id: String(item.id ?? "").trim(), quantity: Math.max(1, Math.floor(Number(item.quantity)) || 1) })).filter((item) => /^\d+$/.test(item.id));
  if (!products.length) return jsonError("أضف منتجًا واحدًا على الأقل");
  const acceptedMethods = (Array.isArray(body?.acceptedMethods) ? body.acceptedMethods : []).filter((method): method is SallaPaymentMethod => (SALLA_PAYMENT_METHODS as readonly string[]).includes(method));
  if (!acceptedMethods.length) return jsonError("اختر طريقة دفع واحدة على الأقل");
  const pickup = body?.delivery?.method === "pickup";
  const branchId = String(body?.delivery?.branchId ?? "").trim();
  if (pickup && !/^\d+$/.test(branchId)) return jsonError("اختر فرع الاستلام");

  const payload = buildNewOrderPayload({ customer: { ...customer, mobile: customer.mobile.replace(/[\s-]/g, "") }, products, acceptedMethods, delivery: { method: pickup ? "pickup" : "none", branchId }, couponCode: body?.couponCode });
  const result = await createSallaOrder(user.tenantId, payload);
  if (!result.ok) return jsonError(result.error, result.status >= 500 ? 502 : 400);

  await logAdminAction(user.tenantId, await getTenantCompanyName(user.tenantId), `تم إنشاء طلب سلة ${result.order?.reference || ""} للعميل ${customer.name} بواسطة ${user.name}.`, "معلومة", "المتجر");
  let whatsapp: OrderLinkResult | null = null;
  if (body?.sendWhatsApp === true && result.order?.customerUrl) {
    whatsapp = await sendOrderLinkOnWhatsApp({ tenantId: user.tenantId, phone: customer.mobile, text: orderLinkText({ name: customer.name, reference: result.order.reference, url: result.order.customerUrl }), author: user.name });
  }
  return jsonOk({ ...result.order, whatsapp });
}
