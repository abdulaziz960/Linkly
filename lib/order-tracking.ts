import { prisma } from "./prisma";
import { ensureCatalogSchema } from "./catalog-schema";
import { shortOrderNumber } from "./order-number";

export const TRACKING_STAGES = ["preparing", "shipped", "delivered"] as const;
export type TrackingStage = typeof TRACKING_STAGES[number];

export type OrderTracking = { stage: TrackingStage; carrier: string; trackingNumber: string; trackingUrl: string; updatedAt: string };

export const STAGE_LABELS: Record<TrackingStage, string> = {
  preparing: "قيد التجهيز",
  shipped: "تم الشحن",
  delivered: "تم التسليم"
};

type Row = { order_id: string; stage: string; carrier: string; tracking_number: string; tracking_url: string; updated_at: string };

function toTracking(row: Row): OrderTracking {
  const stage = (TRACKING_STAGES as readonly string[]).includes(row.stage) ? (row.stage as TrackingStage) : "preparing";
  return { stage, carrier: row.carrier, trackingNumber: row.tracking_number, trackingUrl: row.tracking_url, updatedAt: row.updated_at };
}

export async function getOrderTracking(orderIds: string[]): Promise<Map<string, OrderTracking>> {
  const result = new Map<string, OrderTracking>();
  if (!orderIds.length) return result;
  await ensureCatalogSchema();
  const { Prisma } = await import("@prisma/client");
  for (let start = 0; start < orderIds.length; start += 200) {
    const batch = orderIds.slice(start, start + 200);
    const rows = await prisma.$queryRaw<Row[]>`SELECT order_id, stage, carrier, tracking_number, tracking_url, updated_at FROM catalog_order_tracking WHERE order_id IN (${Prisma.join(batch)})`;
    for (const row of rows) result.set(row.order_id, toTracking(row));
  }
  return result;
}

export type TrackingInput = { stage?: unknown; carrier?: unknown; trackingNumber?: unknown; trackingUrl?: unknown };

export function cleanTrackingInput(input: TrackingInput): { ok: true; data: { stage: TrackingStage; carrier: string; trackingNumber: string; trackingUrl: string } } | { ok: false; error: string } {
  const stage = String(input.stage ?? "");
  if (!(TRACKING_STAGES as readonly string[]).includes(stage)) return { ok: false, error: "مرحلة الشحن غير صالحة" };
  const carrier = String(input.carrier ?? "").trim().slice(0, 80);
  const trackingNumber = String(input.trackingNumber ?? "").trim().slice(0, 80);
  const trackingUrl = String(input.trackingUrl ?? "").trim().slice(0, 500);
  if (trackingUrl && !/^https?:\/\/\S+$/i.test(trackingUrl)) return { ok: false, error: "رابط التتبع يجب أن يبدأ بـ https://" };
  if (stage === "shipped" && !trackingNumber && !trackingUrl) return { ok: false, error: "أدخل رقم الشحنة أو رابط التتبع" };
  return { ok: true, data: { stage: stage as TrackingStage, carrier, trackingNumber, trackingUrl } };
}

/** The message the customer gets when the stage changes (or when they ask for their order's status). */
export function buildTrackingMessage(orderId: string, tracking: Pick<OrderTracking, "stage" | "carrier" | "trackingNumber" | "trackingUrl">): string {
  const lines = [`طلبك ${shortOrderNumber(orderId)}`, `الحالة: ${STAGE_LABELS[tracking.stage]}`];
  if (tracking.stage === "shipped") {
    if (tracking.carrier) lines.push(`شركة الشحن: ${tracking.carrier}`);
    if (tracking.trackingNumber) lines.push(`رقم الشحنة: ${tracking.trackingNumber}`);
    if (tracking.trackingUrl) lines.push(`رابط التتبع: ${tracking.trackingUrl}`);
  }
  if (tracking.stage === "delivered") lines.push("نتمنى أن ينال رضاك.");
  return lines.join("\n");
}

/**
 * Saves the tracking of an order of this workspace and, when the stage moved (or the shipment details changed),
 * tells the customer in their conversation. A delivered order is also marked fulfilled.
 */
export async function saveOrderTracking(
  tenantId: string,
  orderId: string,
  input: TrackingInput
): Promise<{ ok: true; tracking: OrderTracking; notified: boolean } | { ok: false; error: string; status: number }> {
  const cleaned = cleanTrackingInput(input);
  if (!cleaned.ok) return { ok: false, error: cleaned.error, status: 400 };
  await ensureCatalogSchema();
  const order = await prisma.catalogOrder.findFirst({ where: { tenantId, id: orderId } });
  if (!order) return { ok: false, error: "الطلب غير موجود", status: 404 };
  if (order.status === "cancelled" || order.status === "awaiting_payment") return { ok: false, error: "لا يمكن تحديث الشحن لطلب غير مدفوع أو ملغي", status: 400 };

  const previous = (await getOrderTracking([orderId])).get(orderId);
  const now = new Date().toISOString();
  const data = cleaned.data;
  await prisma.$executeRaw`DELETE FROM catalog_order_tracking WHERE order_id = ${orderId}`;
  await prisma.$executeRaw`INSERT INTO catalog_order_tracking (order_id, stage, carrier, tracking_number, tracking_url, updated_at) VALUES (${orderId}, ${data.stage}, ${data.carrier}, ${data.trackingNumber}, ${data.trackingUrl}, ${now})`;
  if (data.stage === "delivered" && order.status !== "fulfilled") {
    await prisma.catalogOrder.update({ where: { id: orderId }, data: { status: "fulfilled", updatedAt: now } });
  }

  const changed = !previous || previous.stage !== data.stage || previous.trackingNumber !== data.trackingNumber || previous.trackingUrl !== data.trackingUrl || previous.carrier !== data.carrier;
  let notified = false;
  if (changed && order.conversationId) {
    try {
      const conversation = await prisma.conversation.findUnique({ where: { id: order.conversationId }, include: { customer: true } });
      if (conversation) {
        const { sendWhatsAppTextMessage } = await import("./whatsapp-send");
        await sendWhatsAppTextMessage({
          tenantId,
          conversationId: order.conversationId,
          to: conversation.customer.phone,
          text: buildTrackingMessage(orderId, data),
          author: "الرد الآلي"
        });
        notified = true;
      }
    } catch (error) {
      console.error("Order tracking notification failed", error);
    }
  }
  return { ok: true, tracking: { ...data, updatedAt: now }, notified };
}

const TRACK_WORDS = /^\s*(تتبع|تتبّع|track)\s*(طلبي|الطلب|طلب|order)?\s*(#?\s*(ORD-?[0-9A-F]{4,}))?\s*$/i;

/** Whether a customer's text asks for their order's status ("تتبع طلبي" / "تتبع ORD-XXXX"); returns the order number they gave, if any. */
export function parseTrackRequest(text: string): { match: boolean; number: string } {
  const m = TRACK_WORDS.exec(text || "");
  if (!m) return { match: false, number: "" };
  return { match: true, number: (m[4] || "").replace(/-/g, "").toUpperCase() };
}

/** The reply to "تتبع طلبي": only orders of this very conversation. Null when the customer has no orders here (the bot then stays out of it). */
export async function buildCustomerTrackingReply(tenantId: string, conversationId: string, number: string): Promise<string | null> {
  await ensureCatalogSchema();
  const orders = await prisma.catalogOrder.findMany({ where: { tenantId, conversationId, status: { in: ["paid", "fulfilled"] } }, orderBy: { createdAt: "desc" }, take: 20 });
  if (!orders.length) return null;
  const picked = number ? orders.filter((order) => shortOrderNumber(order.id).replace(/-/g, "") === number) : orders.slice(0, 3);
  if (!picked.length) return "لم نجد طلبًا بهذا الرقم. تأكد من الرقم الموجود في إيصالك.";
  const tracking = await getOrderTracking(picked.map((order) => order.id));
  return picked
    .map((order) => buildTrackingMessage(order.id, tracking.get(order.id) ?? { stage: "preparing", carrier: "", trackingNumber: "", trackingUrl: "" }))
    .join("\n\n");
}
