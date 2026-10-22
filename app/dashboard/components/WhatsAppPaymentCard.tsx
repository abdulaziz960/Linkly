"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";

/** Direct link to Meta's billing hub, where the owner adds or fixes the card that pays for WhatsApp messages. */
export default function WhatsAppPaymentCard() {
  const { t } = useLanguage();
  const [data, setData] = useState<{ hasIssue: boolean; payUrl: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/whatsapp/payment-status", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { hasIssue?: boolean; payUrl?: string }) => {
        if (!cancelled && result.payUrl) setData({ hasIssue: Boolean(result.hasIssue), payUrl: result.payUrl });
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="wa-card wa-card-wide">
      <strong>{t("بطاقة الدفع لرسائل واتساب", "Payment card for WhatsApp messages")}</strong>
      <span className="wa-card-note">
        {data?.hasIssue
          ? t("تعذر الدفع لحسابك في Meta، وقد يتوقف إرسال الرسائل. أضف بطاقة أو حدّث طريقة الدفع.", "Payment failed on your Meta account and sending may stop. Add a card or update the payment method.")
          : t("رسوم المحادثات تُحصَّل من Meta مباشرة. أضف بطاقة دفع لحسابك لتستمر الرسائل دون انقطاع.", "Conversation fees are charged by Meta directly. Add a payment card to your account so messages keep flowing.")}
      </span>
      <div className="wa-card-actions">
        <a className="primary-action" href={data?.payUrl || "https://business.facebook.com/billing_hub/payment_settings"} target="_blank" rel="noopener noreferrer">
          {t("إضافة بطاقة الدفع", "Add payment card")}
        </a>
      </div>
    </div>
  );
}
