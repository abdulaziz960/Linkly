export const metadata = { title: "تم استلام طلبك" };

export default function OrderThanksPage() {
  return (
    <main dir="rtl" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "Tahoma, Arial, sans-serif", background: "#eaf3f1", color: "#123330" }}>
      <section style={{ maxWidth: 420, textAlign: "center", background: "#fff", border: "1px solid #d8e8e5", borderRadius: 20, padding: "40px 28px" }}>
        <h1 style={{ margin: "0 0 12px", fontSize: 26 }}>شكرًا لك!</h1>
        <p style={{ margin: 0, lineHeight: 1.9, color: "#5b7570" }}>تمت معالجة طلبك. ستصلك رسالة تأكيد على الواتساب، ويمكنك الآن إغلاق هذه الصفحة والعودة إلى المحادثة.</p>
      </section>
    </main>
  );
}
