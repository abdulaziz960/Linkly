// A push notification to the workspace's staff (desktop or phone app) when a new chat order needs them: paid, or placed
// without online payment so that a person follows it up. Best-effort - an order is never held up by a failed alert.

import { notifyTenant } from "./push-notifications";
import { formatMoney } from "./catalog-cart";
import { shortOrderNumber } from "./order-number";

export async function notifyNewOrder(order: { id: string; tenantId: string; total: number; currency: string; customerName?: string | null }, paid: boolean): Promise<void> {
  try {
    await notifyTenant(order.tenantId, {
      title: paid ? "طلب جديد مدفوع" : "طلب جديد بانتظار المتابعة",
      body: `${shortOrderNumber(order.id)} · ${formatMoney(order.total, order.currency)}${order.customerName ? ` · ${order.customerName}` : ""}`,
      url: "/dashboard?view=catalog"
    });
  } catch (error) {
    console.error("New order alert failed", error);
  }
}
