"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import "../billing.css";
import { useStoredLanguage } from "../../useStoredLanguage";

const copy = {
  ar: {
    subscription: {
      heading: "تم تفعيل الاشتراك",
      body: "اكتملت رحلة الشراء بنجاح وأصبحت الباقة نشطة على حسابك.",
      failedHeading: "تعذر إتمام الدفع",
      failedBody: "لم يتم تأكيد الدفعة بعد بنك البطاقة. لم يُخصم أي مبلغ وتفعّل الاشتراك، يمكنك إعادة المحاولة من صفحة الاشتراك.",
      backToBilling: "العودة إلى صفحة الاشتراك"
    },
    campaign_topup: {
      heading: "تمت إضافة الرصيد",
      body: "اكتملت عملية الشحن بنجاح وأصبح الرصيد الجديد متاحًا لحملاتك.",
      failedHeading: "تعذر إتمام الدفع",
      failedBody: "لم يتم تأكيد الدفعة بعد بنك البطاقة. لم يُخصم أي مبلغ ولم يُضَف أي رصيد، يمكنك إعادة المحاولة من تبويب الرصيد والشحن.",
      backToBilling: "العودة إلى لوحة العميل"
    },
    backToDashboard: "العودة إلى لوحة العميل",
    viewSubscription: "عرض تفاصيل الاشتراك",
    confirming: "جارٍ التحقق من الدفعة..."
  },
  en: {
    subscription: {
      heading: "Subscription activated",
      body: "Your purchase completed successfully and the plan is now active on your account.",
      failedHeading: "Payment not completed",
      failedBody: "Your bank did not confirm the payment. Nothing was charged and the plan was not activated - you can try again from the billing page.",
      backToBilling: "Back to billing"
    },
    campaign_topup: {
      heading: "Balance topped up",
      body: "Your top-up completed successfully and the new balance is now available for your campaigns.",
      failedHeading: "Payment not completed",
      failedBody: "Your bank did not confirm the payment. Nothing was charged and no balance was added - you can try again from the Balance & Top-up tab.",
      backToBilling: "Back to dashboard"
    },
    backToDashboard: "Back to dashboard",
    viewSubscription: "View subscription details",
    confirming: "Confirming your payment..."
  }
} as const;

type Lang = keyof typeof copy;
type Kind = "subscription" | "campaign_topup";

const confirmUrlByKind: Record<Kind, string> = {
  subscription: "/api/billing/confirm-payment",
  campaign_topup: "/api/campaigns/balance/confirm-payment"
};

/**
 * Cards needing out-of-band 3-D Secure fully navigate away and back here
 * instead of resolving inside MoyasarPayForm's on_completed, so this page
 * can be reached before the confirm-payment route ever ran. Never trust
 * that arrival alone as proof of payment (mirrors the "never trust the
 * caller" rule in lib/moyasar-webhook.ts) - if a moyasarPaymentId comes back
 * in the query string, re-run the same server-verified confirm before
 * showing anything as activated. `kind` (threaded through by MoyasarPayForm)
 * picks which payment row and copy this checkout was for.
 */
function BillingSuccessStatus({ lang }: { lang: Lang }) {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get("paymentId");
  const moyasarPaymentId = searchParams.get("id");
  const kind: Kind = searchParams.get("kind") === "campaign_topup" ? "campaign_topup" : "subscription";
  const [state, setState] = useState<"confirming" | "success" | "failed">(
    paymentId && moyasarPaymentId ? "confirming" : "success"
  );
  const text = copy[lang];
  const kindText = text[kind];

  useEffect(() => {
    if (!paymentId || !moyasarPaymentId) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(confirmUrlByKind[kind], {
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
  }, [paymentId, moyasarPaymentId, kind]);

  if (state === "confirming") return <p className="payment-note">{text.confirming}</p>;

  if (state === "failed") {
    return (
      <>
        <h1>{kindText.failedHeading}</h1>
        <p>{kindText.failedBody}</p>
        <div className="test-actions">
          <Link className="primary-link" href={kind === "campaign_topup" ? "/dashboard?view=campaigns&tab=balance" : "/billing"}>{kindText.backToBilling}</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <b className="success-payment">✓</b>
      <h1>{kindText.heading}</h1>
      <p>{kindText.body}</p>
      <div className="test-actions">
        <Link className="primary-link" href={kind === "campaign_topup" ? "/dashboard?view=campaigns&tab=balance" : "/dashboard"}>{text.backToDashboard}</Link>
        {kind === "subscription" ? <Link href="/billing">{text.viewSubscription}</Link> : null}
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
