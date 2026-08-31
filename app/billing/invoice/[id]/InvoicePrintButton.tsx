"use client";

export default function InvoicePrintButton() {
  return (
    <button type="button" onClick={() => window.print()}>
      تنزيل PDF / طباعة
    </button>
  );
}
