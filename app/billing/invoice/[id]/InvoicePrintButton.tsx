"use client";

export default function InvoicePrintButton() {
  return (
    <button type="button" onClick={() => window.print()}>
      طباعة الفاتورة
    </button>
  );
}
