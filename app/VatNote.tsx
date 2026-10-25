/** The red line under every price list: prices are without VAT, which is added at the payment page. */
export default function VatNote({ lang = "ar", compact = false }: { lang?: "ar" | "en"; compact?: boolean }) {
  return (
    <p role="note" style={{ color: "#d92d20", fontWeight: 800, fontSize: compact ? 12 : 14, margin: compact ? "6px 0 0" : "14px 0 0", textAlign: "center" }}>
      {lang === "en"
        ? "Prices exclude VAT. 15% VAT is added on the payment page."
        : "الأسعار غير شاملة ضريبة القيمة المضافة (15%)، وتُضاف عند صفحة الدفع."}
    </p>
  );
}
