"use client";
import { useLayoutEffect, useRef } from "react";

type Props = {
  visible: boolean;
  language: "ar" | "en";
};

const META_WHATSAPP_PAYMENTS_URL = "https://business.facebook.com/wa/manage/payment-methods/";

// Mirrors TrialCountdownBanner's own height-into-a-CSS-var pattern (see
// dashboard.css's --top-banners-h, which sums this banner's height with the
// trial/top-links one instead of taking their max - the two can be visible
// at the same time, unlike trial vs. top-links which never coexist).
export default function WhatsAppPaymentBanner({ visible, language }: Props) {
  const t = (ar: string, en: string) => (language === "en" ? en : ar);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) {
      document.documentElement.style.setProperty("--whatsapp-payment-banner-h", "0px");
      return;
    }
    const update = () => document.documentElement.style.setProperty("--whatsapp-payment-banner-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty("--whatsapp-payment-banner-h", "0px");
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div ref={rootRef} className="whatsapp-payment-banner" role="alert">
      <div className="whatsapp-payment-pill">
        <i className="whatsapp-payment-icon" aria-hidden="true">⚠</i>
        <span className="whatsapp-payment-text">
          {t("توجد مشكلة بالدفع مع حساب واتساب على ميتا - الرسائل متوقفة حتى تُحل", "There's a payment problem with your Meta WhatsApp account - messages are blocked until it's resolved")}
        </span>
        <a href={META_WHATSAPP_PAYMENTS_URL} target="_blank" rel="noopener noreferrer" className="whatsapp-payment-cta">
          {t("سدد الآن", "Pay now")}
          <b aria-hidden="true">{t("←", "→")}</b>
        </a>
      </div>
    </div>
  );
}
