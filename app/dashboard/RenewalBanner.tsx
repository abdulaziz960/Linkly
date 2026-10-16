"use client";
import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { getRenewalNotice, type RenewalNoticeInput } from "../../lib/renewal-notice";

type Props = {
  subscription: RenewalNoticeInput | null;
  /** Only the account owner can pay, so only they see it. */
  visible: boolean;
  language: "ar" | "en";
};

/** Renewal warnings for a paid workspace: ending soon, a failed automatic charge, or a lapsed renewal. */
export default function RenewalBanner({ subscription, visible, language }: Props) {
  const t = (ar: string, en: string) => (language === "en" ? en : ar);
  const notice = visible ? getRenewalNotice(subscription) : null;
  const rootRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => document.documentElement.style.setProperty("--trial-banner-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty("--trial-banner-h", "0px");
    };
  }, [notice?.kind]);

  if (!notice) return null;

  const danger = notice.kind !== "ending-soon";
  const message =
    notice.kind === "overdue"
      ? t("انتهت مدة اشتراكك. جدّد الآن حتى لا يتوقف حسابك", "Your subscription period has ended. Renew now so your account is not suspended")
      : notice.kind === "charge-failed"
        ? t("فشل خصم تجديد اشتراكك من البطاقة. حدّث بيانات الدفع أو جدّد الآن", "Charging your card for the renewal failed. Update your payment details or renew now")
        : notice.daysLeft <= 1
          ? t("ينتهي اشتراكك خلال يوم واحد", "Your subscription ends within a day")
          : t(`ينتهي اشتراكك خلال ${notice.daysLeft} أيام`, `Your subscription ends in ${notice.daysLeft} days`);

  return (
    <div ref={rootRef} className={`trial-countdown-banner${danger ? " expired" : ""}`} role="status">
      <div className="trial-countdown-pill">
        <i className="trial-countdown-icon" aria-hidden="true">{danger ? "⚠️" : "⏳"}</i>
        <span className="trial-countdown-text">{message}</span>
        <Link href="/billing" className="trial-countdown-cta">
          {t("جدّد الآن", "Renew now")}
          <b aria-hidden="true">{t("←", "→")}</b>
        </Link>
      </div>
    </div>
  );
}
