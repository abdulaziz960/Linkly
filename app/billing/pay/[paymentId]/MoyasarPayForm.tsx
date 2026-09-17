"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";

declare global {
  interface Window {
    Moyasar?: { init: (config: Record<string, unknown>) => void };
  }
}

type Props = {
  paymentId: string;
  amountHalalas: number;
  description: string;
  publishableKey: string;
};

const MOYASAR_JS_URL = "https://cdn.moyasar.com/mpf/1.16.0/moyasar.js";
const MOYASAR_CSS_URL = "https://cdn.moyasar.com/mpf/1.16.0/moyasar.css";

/**
 * Renders Moyasar's embedded card-entry widget (their JS, our page around
 * it) and confirms the result with our own server the moment it completes -
 * on_completed's payment.status is client-reported and never trusted for
 * activation; /api/billing/confirm-payment re-fetches the real status with
 * the secret key before anything is applied.
 */
export default function MoyasarPayForm({ paymentId, amountHalalas, description, publishableKey }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (document.querySelector(`link[href="${MOYASAR_CSS_URL}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = MOYASAR_CSS_URL;
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    if (!scriptReady || !window.Moyasar || !formRef.current) return;
    window.Moyasar.init({
      // Moyasar.js renames this element's id as a side effect of its first
      // render, so a CSS-selector string (it re-resolves internally on every
      // later re-render) stops matching anything right after - only a live
      // element reference survives that rename. Confirmed against 1.15.0 and
      // 1.16.0 in an isolated standalone test before wiring this up.
      element: formRef.current,
      amount: amountHalalas,
      currency: "SAR",
      description,
      publishable_api_key: publishableKey,
      callback_url: `${window.location.origin}/billing/success`,
      methods: ["creditcard"],
      on_completed: async (payment: { id: string }) => {
        setConfirming(true);
        setError("");
        try {
          const response = await fetch("/api/billing/confirm-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paymentId, moyasarPaymentId: payment.id })
          });
          const payload = await response.json().catch(() => ({})) as { error?: string };
          if (!response.ok) throw new Error(payload.error || "تعذر تأكيد الدفعة");
          router.push("/billing/success");
        } catch (err) {
          setConfirming(false);
          setError(err instanceof Error ? err.message : "تعذر تأكيد الدفعة");
        }
      }
    });
    // scriptReady only ever flips false -> true once; re-running this on
    // every render would re-init the widget and duplicate its DOM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptReady]);

  return (
    <div>
      <Script src={MOYASAR_JS_URL} strategy="afterInteractive" onReady={() => setScriptReady(true)} />
      {error ? <p className="billing-error" role="alert">{error}</p> : null}
      {confirming ? <p className="payment-note">جارٍ تأكيد الدفعة...</p> : null}
      <div ref={formRef} className="mysr-form" />
    </div>
  );
}
