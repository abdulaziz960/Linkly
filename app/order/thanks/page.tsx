import { processOrderPaymentCallback } from "../../../lib/catalog-payments";
import { consumeRateLimit } from "../../../lib/rate-limit";

export const metadata = { title: "تم استلام طلبك" };
export const dynamic = "force-dynamic";

export default async function OrderThanksPage({ searchParams }: { searchParams: Promise<{ o?: string }> }) {
  // The customer just came back from the payment page: confirm the payment now (re-verified with
  // Moyasar, idempotent) instead of waiting for the payment callback or the periodic check.
  const orderId = ((await searchParams).o || "").slice(0, 80);
  if (orderId) {
    const limit = await consumeRateLimit("order-thanks", orderId, 8, 5 * 60 * 1000).catch(() => null);
    if (limit?.allowed) await processOrderPaymentCallback(orderId).catch((error) => console.error("Order thanks verification failed", error));
  }

  return (
    <main dir="rtl" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "Tahoma, Arial, sans-serif", background: "#eaf3f1", color: "#123330" }}>
      <section style={{ maxWidth: 420, textAlign: "center", background: "#fff", border: "1px solid #d8e8e5", borderRadius: 20, padding: "40px 28px" }}>
        <h1 style={{ margin: "0 0 12px", fontSize: 26 }}>شكرًا لك!</h1>
        <p style={{ margin: 0, lineHeight: 1.9, color: "#5b7570" }}>تمت معالجة طلبك. ستصلك رسالة تأكيد على الواتساب، ويمكنك الآن إغلاق هذه الصفحة والعودة إلى المحادثة.</p>
      </section>
    </main>
  );
}
