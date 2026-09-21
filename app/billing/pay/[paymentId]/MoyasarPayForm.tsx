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
  const [saveCard, setSaveCard] = useState(false);
  // on_completed is defined once inside the [scriptReady]-only effect below
  // (re-running it on every checkbox toggle would re-init the widget and
  // duplicate its DOM, per the comment there) - a ref, not the state
  // itself, is what lets that closure see the checkbox's LATEST value
  // instead of whatever it was when the effect first ran.
  const saveCardRef = useRef(false);

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
      // The save-card checkbox's value is NOT reflected here (this URL is
      // built once, at widget init, before the checkbox can be touched) -
      // it survives that navigation via localStorage instead, written on
      // every checkbox change below and read back on /billing/success.
      callback_url: `${window.location.origin}/billing/success?paymentId=${encodeURIComponent(paymentId)}&kind=${kind}`,
      methods: ["creditcard"],
      // Attempting tokenization is harmless even when the account doesn't
      // support it (Moyasar just returns no token) - the actual opt-in
      // that decides whether we ACT on a returned token lives in the
      // checkbox below, sent as enableAutoRenew and enforced server-side
      // in /api/billing/confirm-payment, not here.
      ...(kind === "subscription" ? { save_card: true } : {}),
      on_completed: async (payment: { id: string }) => {
        setConfirming(true);
        setError("");
        try {
          const response = await fetch(confirmUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paymentId, moyasarPaymentId: payment.id, enableAutoRenew: saveCardRef.current })
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
      {kind === "subscription" ? (
        <label className="save-card-option">
          <input
            type="checkbox"
            checked={saveCard}
            onChange={(event) => {
              setSaveCard(event.target.checked);
              saveCardRef.current = event.target.checked;
              // Only a per-browser convenience for the 3-D-Secure redirect
              // case (see the callback_url comment above) - never read back
              // as proof of anything; /billing/success still only ever acts
              // on it via the normal server-verified confirm call.
              try {
                localStorage.setItem(`linkly:enableAutoRenew:${paymentId}`, event.target.checked ? "1" : "0");
              } catch {
                // Private browsing / blocked storage - the on_completed path
                // (same tab, no navigation) still works via the ref either way.
              }
            }}
          />
          فعّل التجديد التلقائي - نحفظ بيانات هذه البطاقة بأمان لدى بوابة الدفع (Moyasar) ونجدد اشتراكك تلقائيًا كل شهر. يمكنك إيقافه في أي وقت من صفحة الفوترة.
        </label>
      ) : null}
      <div ref={formRef} className="mysr-form" />
    </div>
  );
}
