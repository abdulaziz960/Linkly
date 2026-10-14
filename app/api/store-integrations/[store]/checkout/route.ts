import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { readStoreTokens } from "../../../../../lib/store-connections";
import { getStoreSettings } from "../../../../../lib/store-settings";
import { findZidPaymentLinkMethodId, listZidDeliveryOptions } from "../../../../../lib/zid-checkout";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

type Params = { params: Promise<{ store: string }> };

/**
 * What the owner needs to switch on "buy from WhatsApp creates the order in Zid": the store's delivery
 * options to pick one from, and the payment-link method id when Zid lets us look it up.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const { store } = await params;
  if (store !== "zid") return jsonError("الشراء من واتساب متاح لمتجر زد فقط", 404);
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "integrations"))) return jsonError("لا تملك صلاحية الوصول", 403);
  if (!(await readStoreTokens(user.tenantId, "zid"))) return jsonError("اربط متجر زد أولًا", 400);

  const { settings } = await getStoreSettings(user.tenantId, "zid");
  const delivery = await listZidDeliveryOptions(user.tenantId);
  const suggestedPaymentMethodId = settings.checkout.paymentMethodId > 0 ? settings.checkout.paymentMethodId : await findZidPaymentLinkMethodId(user.tenantId);
  return jsonOk({
    deliveryOptions: delivery.options,
    deliveryError: delivery.ok ? "" : delivery.message,
    paymentMethodId: settings.checkout.paymentMethodId,
    suggestedPaymentMethodId
  });
}
