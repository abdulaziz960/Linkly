"use client";

export default function PrintButton() {
  return <button type="button" className="qa-btn" onClick={() => window.print()}>طباعة / حفظ PDF</button>;
}
