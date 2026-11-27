"use client";

import { useEffect, useRef, useState } from "react";
import type { BillingCycle } from "../../../../lib/billing-pricing";
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
  /** Text for the customer's card statement - already sanitized by paymentStatementDescriptor(). */
  statementDescriptor: string;
  /** Which payment row this confirms against - see /billing/success. Defaults to "subscription". */
  kind?: "subscription" | "campaign_topup" | "email_topup";
  /** Server route that verifies the completed payment and applies its outcome. */
  confirmUrl?: string;
  /**
   * Subscription checkout with auto-renew: what every renewal will take. When set, paying saves the card and turns
   * auto-renew on, as the notice above the card fields says; the owner can switch it off on the billing page.
   */
  renewal?: { total: string; cycle: BillingCycle; includesVat: boolean };
};

const RENEWAL_EVERY: Record<BillingCycle, string> = { "شهري": "كل شهر", "ربع سنوي": "كل 3 أشهر", "نصف سنوي": "كل 6 أشهر", "سنوي": "كل سنة" };

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
export default function MoyasarPayForm({ paymentId, amountHalalas, description, publishableKey, statementDescriptor, kind = "subscription", confirmUrl = "/api/billing/confirm-payment", renewal }: Props) {
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
      // autoRenew travels in this URL so a payment that comes back through 3-D Secure enrolls like any other.
      callback_url: `${window.location.origin}/billing/success?paymentId=${encodeURIComponent(paymentId)}&kind=${kind}${renewal ? "&autoRenew=1" : ""}`,
      // Ties the card payment to this one row: the confirm routes refuse it for any other row (paymentMatchesRow).
      metadata: { payment_id: paymentId },
      methods: ["creditcard"],
      // Moyasar.js throws on a descriptor it considers malformed, so it is
      // only passed when it matches the widget's own rule.
      ...(/^[A-Za-z0-9 -]{1,64}$/.test(statementDescriptor) ? { statement_descriptor: statementDescriptor } : {}),
      // The form reads this only inside credit_card (docs.moyasar.com, "Tokenize (Save) Credit Card"); at the top
      // level it is ignored, no token comes back and no card is ever saved for auto-renew.
      ...(renewal ? { credit_card: { save_card: true } } : {}),
      on_completed: async (payment: { id: string }) => {
        setConfirming(true);
        setError("");
        try {
          const response = await fetch(confirmUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paymentId, moyasarPaymentId: payment.id, enableAutoRenew: Boolean(renewal) })
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
          router.push(kind === "email_topup" ? "/dashboard?view=emailPromotions&tab=balance" : kind === "campaign_topup" ? "/dashboard?view=campaigns&tab=balance" : "/dashboard?view=inbox");
        } catch (err) {
          setConfirming(false);
          setError(err instanceof Error ? err.message : "تعذر تأكيد الدفعة");
          // Never leave the visitor stuck on the payment form regardless of
          // outcome - give them a moment to read why it failed, then send
          // them back same as a success. The campaign top-up instance of
          // this form runs inside a window.open("_blank","noopener") popup
          // (see CampaignsView.tsx), which severed window.opener - this
          // navigates that popup tab itself, matching how this app's other
          // popup flows (Meta/Google/etc. OAuth callbacks) already redirect
          // the popup rather than trying to reach back into a nulled opener.
          window.setTimeout(() => router.push(kind === "email_topup" ? "/dashboard?view=emailPromotions&tab=balance" : kind === "campaign_topup" ? "/dashboard?view=campaigns&tab=balance" : "/dashboard?view=inbox"), 2500);
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
      {renewal ? (
        <p className="renewal-notice">
          يتجدد تلقائيًا {RENEWAL_EVERY[renewal.cycle]} بـ <b>{renewal.total} ر.س</b>{renewal.includesVat ? " شامل الضريبة" : ""}، ويمكنك إيقافه من «الباقات والاشتراك».
        </p>
      ) : null}
      <div ref={formRef} className="mysr-form" />
    </div>
  );
}
