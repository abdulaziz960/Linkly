"use client";

export default function InvoicePrintButton({ lang = "ar" }: { lang?: "ar" | "en" }) {
  return (
    <button type="button" onClick={() => window.print()}>
      {lang === "en" ? "Download PDF / Print" : "تنزيل PDF / طباعة"}
    </button>
  );
}
