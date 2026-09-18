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
  /** Which payment row this confirms against - see /billing/success. Defaults to "subscription". */
  kind?: "subscription" | "campaign_topup";
  /** Server route that verifies the completed payment and applies its outcome. */
  confirmUrl?: string;
};

const MOYASAR_JS_URL = "https://cdn.moyasar.com/mpf/1.16.0/moyasar.js";
const MOYASAR_CSS_URL = "https://cdn.moyasar.com/mpf/1.16.0/moyasar.css";

/**
 * Renders Moyasar's embedded card-entry widget (their JS, our page around
 * it) and confirms the result with our own server the moment it completes -
 * on_completed's payment.status is client-reported and never trusted for
 * activation; confirmUrl re-fetches the real status with the secret key
 * before anything is applied. Shared by the subscription checkout
 * (app/billing/pay/[paymentId]) and the campaign top-up checkout
 * (app/billing/pay/campaign/[paymentId]) via the kind/confirmUrl props.
 */
export default function MoyasarPayForm({ paymentId, amountHalalas, description, publishableKey, kind = "subscription", confirmUrl = "/api/billing/confirm-payment" }: Props) {
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
      // Cards that need out-of-band 3-D Secure fully navigate the browser
      // away and back rather than resolving inside on_completed below, so
      // the paymentId is threaded through the query string - /billing/success
      // needs it to run the same server-side confirm on that return trip.
      callback_url: `${window.location.origin}/billing/success?paymentId=${encodeURIComponent(paymentId)}&kind=${kind}`,
      methods: ["creditcard"],
      on_completed: async (payment: { id: string }) => {
        setConfirming(true);
        setError("");
        try {
          const response = await fetch(confirmUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paymentId, moyasarPaymentId: payment.id })
          });
          const payload = await response.json().catch(() => ({})) as { error?: string; outcome?: string };
          if (!response.ok) throw new Error(payload.error || "تعذر تأكيد الدفعة");
          // confirmUrl answers HTTP 200 even for a declined card (it only
          // fails the request itself on an amount mismatch) - outcome is the
          // real verified result, and a non-completed one must never reach
          // the success page the same way a passed 3-D-Secure return does.
          if (payload.outcome !== "completed" && payload.outcome !== "already_processed") {
            throw new Error("لم تتم الموافقة على الدفعة من جهة البنك. تحقق من بيانات البطاقة أو استخدم بطاقة أخرى.");
          }
          router.push(`/billing/success?kind=${kind}`);
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
