"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function TestCheckout({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setLoading(true);
    const response = await fetch("/api/billing/confirm-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId })
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      setLoading(false);
      setError(payload.error || "تعذر تأكيد العملية");
      return;
    }
    router.push("/billing/success");
  }

  return (
    <div className="test-actions">
      {error ? <p className="billing-error" role="alert">{error}</p> : null}
      <button onClick={confirm} disabled={loading || !paymentId}>{loading ? "جاري التأكيد..." : "إتمام الدفع التجريبي"}</button>
      <Link href="/billing">إلغاء والعودة</Link>
    </div>
  );
}
