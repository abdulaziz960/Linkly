// The end-of-day summary of the orders that came in through the chat: how many, how much, what was sold, and the list.
// A day is a calendar day in Saudi time (UTC+3), the market Linkly serves.

import { listOrders, type CatalogOrderRow } from "./catalog";
import { getPaymentMethods, type PaymentMethod } from "./catalog-payment-method";

const RIYADH_OFFSET_MS = 3 * 3_600_000;

/** Today's date (YYYY-MM-DD) in Saudi time. */
export function todayInRiyadh(now = new Date()): string {
  return new Date(now.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

export function isValidDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** The ISO bounds of a Saudi calendar day: from its midnight to the next midnight (excluded). */
export function dayRange(day: string): { from: string; to: string } {
  const start = Date.parse(`${day}T00:00:00Z`) - RIYADH_OFFSET_MS;
  return { from: new Date(start).toISOString(), to: new Date(start + 24 * 3_600_000).toISOString() };
}

export type DailyReport = {
  day: string;
  currency: string;
  /** Orders that count as sales: everything except cancelled and still-unpaid ones. */
  orderCount: number;
  sales: number;
  /** Paid online (paid or fulfilled). */
  paid: number;
  /** Placed without online payment: a person collects it (cash at pickup, transfer...). */
  followUp: { count: number; total: number };
  awaiting: { count: number; total: number };
  cancelled: { count: number; total: number };
  discounts: number;
  deliveryFees: number;
  average: number;
  byFulfillment: Array<{ key: "delivery" | "store" | "car" | "other"; count: number; total: number }>;
  byBranch: Array<{ name: string; count: number; total: number }>;
  /** How the sales were paid: a method, "cash" (placed without online payment) or "unknown" (paid before methods were recorded). */
  byPayment: Array<{ key: PaymentMethod | "cash" | "unknown"; count: number; total: number }>;
  /** The day before, for the comparison (change = percent, null when yesterday had no sales). */
  previous: { day: string; orderCount: number; sales: number; change: number | null };
  products: Array<{ name: string; quantity: number; total: number }>;
  orders: Array<{ id: string; time: string; customerName: string; customerPhone: string; total: number; status: string; fulfillment: string; branch: string }>;
};

const round = (value: number) => Math.round(value * 100) / 100;

/** Pure: the orders of one day into the report. */
export function buildDailyReport(day: string, orders: CatalogOrderRow[], branch = "", methods: Map<string, PaymentMethod> = new Map(), yesterday?: { orderCount: number; sales: number }): DailyReport {
  const scoped = branch ? orders.filter((order) => (order.branchName ?? "") === branch) : orders;
  const counted = scoped.filter((order) => order.status === "paid" || order.status === "fulfilled" || order.status === "new");
  const sum = (list: CatalogOrderRow[]) => round(list.reduce((total, order) => total + order.total, 0));
  const withStatus = (status: string) => scoped.filter((order) => order.status === status);
  const fulfillmentOf = (order: CatalogOrderRow): "delivery" | "store" | "car" | "other" => (order.shipping ? "delivery" : order.pickup ? (order.pickup.kind === "car" ? "car" : "store") : "other");

  const fulfillment = new Map<string, { count: number; total: number }>();
  const branches = new Map<string, { count: number; total: number }>();
  const products = new Map<string, { quantity: number; total: number }>();
  const payments = new Map<string, { count: number; total: number }>();
  for (const order of counted) {
    const method = order.status === "new" ? "cash" : methods.get(order.id) ?? "unknown";
    const pay = payments.get(method) ?? { count: 0, total: 0 };
    payments.set(method, { count: pay.count + 1, total: pay.total + order.total });
    const key = fulfillmentOf(order);
    const f = fulfillment.get(key) ?? { count: 0, total: 0 };
    fulfillment.set(key, { count: f.count + 1, total: f.total + order.total });
    const name = order.branchName || "";
    const b = branches.get(name) ?? { count: 0, total: 0 };
    branches.set(name, { count: b.count + 1, total: b.total + order.total });
    const lines = order.items?.length ? order.items : [{ productName: order.productName, quantity: order.quantity, unitPrice: order.unitPrice }];
    for (const line of lines) {
      const p = products.get(line.productName) ?? { quantity: 0, total: 0 };
      products.set(line.productName, { quantity: p.quantity + line.quantity, total: p.total + line.unitPrice * line.quantity });
    }
  }

  const sales = sum(counted);
  return {
    day,
    currency: scoped[0]?.currency ?? "SAR",
    orderCount: counted.length,
    sales,
    paid: sum(counted.filter((order) => order.status !== "new")),
    followUp: { count: withStatus("new").length, total: sum(withStatus("new")) },
    awaiting: { count: withStatus("awaiting_payment").length, total: sum(withStatus("awaiting_payment")) },
    cancelled: { count: withStatus("cancelled").length, total: sum(withStatus("cancelled")) },
    discounts: round(counted.reduce((total, order) => total + (order.discount?.amount ?? 0), 0)),
    deliveryFees: round(counted.reduce((total, order) => total + (order.shipping?.fee ?? 0), 0)),
    average: counted.length ? round(sales / counted.length) : 0,
    byFulfillment: [...fulfillment].map(([key, value]) => ({ key: key as DailyReport["byFulfillment"][number]["key"], count: value.count, total: round(value.total) })),
    byPayment: [...payments].map(([key, value]) => ({ key: key as DailyReport["byPayment"][number]["key"], count: value.count, total: round(value.total) })).sort((a, b) => b.total - a.total),
    previous: { day: previousDay(day), orderCount: yesterday?.orderCount ?? 0, sales: yesterday?.sales ?? 0, change: yesterday && yesterday.sales > 0 ? Math.round(((sales - yesterday.sales) / yesterday.sales) * 1000) / 10 : null },
    byBranch: [...branches].map(([name, value]) => ({ name, count: value.count, total: round(value.total) })),
    products: [...products].map(([name, value]) => ({ name, quantity: value.quantity, total: round(value.total) })).sort((a, b) => b.quantity - a.quantity),
    orders: [...scoped].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((order) => ({
      id: order.id,
      time: order.createdAt,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      total: order.total,
      status: order.status,
      fulfillment: fulfillmentOf(order),
      branch: order.branchName ?? ""
    }))
  };
}

export function previousDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 24 * 3_600_000).toISOString().slice(0, 10);
}

export async function dailyReport(tenantId: string, day: string, branch = ""): Promise<DailyReport> {
  const [orders, before] = await Promise.all([listOrders(tenantId, 5000, dayRange(day)), listOrders(tenantId, 5000, dayRange(previousDay(day)))]);
  const methods = await getPaymentMethods(orders.map((order) => order.id));
  const yesterday = buildDailyReport(previousDay(day), before, branch);
  return buildDailyReport(day, orders, branch, methods, { orderCount: yesterday.orderCount, sales: yesterday.sales });
}
