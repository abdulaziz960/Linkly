"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import "../billing.css";
import { useStoredLanguage } from "../../useStoredLanguage";

const copy = {
  ar: {
    heading: "تم تفعيل الاشتراك",
    body: "اكتملت رحلة الشراء بنجاح وأصبحت الباقة نشطة على حسابك.",
    backToDashboard: "العودة إلى لوحة العميل",
    viewSubscription: "عرض تفاصيل الاشتراك",
    confirming: "جارٍ التحقق من الدفعة...",
    failedHeading: "تعذر إتمام الدفع",
    failedBody: "لم يتم تأكيد الدفعة بعد بنك البطاقة. لم يُخصم أي مبلغ وتفعّل الاشتراك، يمكنك إعادة المحاولة من صفحة الاشتراك.",
    backToBilling: "العودة إلى صفحة الاشتراك"
  },
  en: {
    heading: "Subscription activated",
    body: "Your purchase completed successfully and the plan is now active on your account.",
    backToDashboard: "Back to dashboard",
    viewSubscription: "View subscription details",
    confirming: "Confirming your payment...",
    failedHeading: "Payment not completed",
    failedBody: "Your bank did not confirm the payment. Nothing was charged and the plan was not activated - you can try again from the billing page.",
    backToBilling: "Back to billing"
  }
} as const;

type Lang = keyof typeof copy;

/**
 * Cards needing out-of-band 3-D Secure fully navigate away and back here
 * instead of resolving inside MoyasarPayForm's on_completed, so this page
 * can be reached before /api/billing/confirm-payment ever ran. Never trust
 * that arrival alone as proof of payment (mirrors the "never trust the
 * caller" rule in lib/moyasar-webhook.ts) - if a moyasarPaymentId comes back
 * in the query string, re-run the same server-verified confirm before
 * showing anything as activated.
 */
function BillingSuccessStatus({ lang }: { lang: Lang }) {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get("paymentId");
  const moyasarPaymentId = searchParams.get("id");
  const [state, setState] = useState<"confirming" | "success" | "failed">(
    paymentId && moyasarPaymentId ? "confirming" : "success"
  );
  const text = copy[lang];

  useEffect(() => {
    if (!paymentId || !moyasarPaymentId) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/billing/confirm-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentId, moyasarPaymentId })
        });
        const payload = await response.json().catch(() => ({})) as { outcome?: string };
        if (cancelled) return;
        setState(response.ok && (payload.outcome === "completed" || payload.outcome === "already_processed") ? "success" : "failed");
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paymentId, moyasarPaymentId]);

  if (state === "confirming") return <p className="payment-note">{text.confirming}</p>;

  if (state === "failed") {
    return (
      <>
        <h1>{text.failedHeading}</h1>
        <p>{text.failedBody}</p>
        <div className="test-actions">
          <Link className="primary-link" href="/billing">{text.backToBilling}</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <b className="success-payment">✓</b>
      <h1>{text.heading}</h1>
      <p>{text.body}</p>
      <div className="test-actions">
        <Link className="primary-link" href="/dashboard">{text.backToDashboard}</Link>
        <Link href="/billing">{text.viewSubscription}</Link>
      </div>
    </>
  );
}

export default function BillingSuccess() {
  const [lang, setLang] = useStoredLanguage("ar");

  return (
    <main className="test-checkout" dir={lang === "ar" ? "rtl" : "ltr"}>
      <section>
        <div className="billing-lang-toggle" style={{ justifyContent: "center", marginBottom: 12 }}>
          <button type="button" aria-pressed={lang === "ar"} className={lang === "ar" ? "active" : ""} onClick={() => setLang("ar")}>العربية</button>
          <button type="button" aria-pressed={lang === "en"} className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>English</button>
        </div>
        <Suspense fallback={<p className="payment-note">{copy[lang].confirming}</p>}>
          <BillingSuccessStatus lang={lang} />
        </Suspense>
      </section>
    </main>
  );
}
