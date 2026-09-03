"use client";
import { useLayoutEffect, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Props = {
  status: string;
  renewalAt: string;
  language: "ar" | "en";
};

function remainingParts(renewalAt: string) {
  const msLeft = new Date(renewalAt).getTime() - Date.now();
  if (!Number.isFinite(msLeft)) return null;
  const totalMinutes = Math.max(0, Math.floor(msLeft / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return { msLeft, days, hours, minutes };
}

export default function TrialCountdownBanner({ status, renewalAt, language }: Props) {
  const t = (ar: string, en: string) => (language === "en" ? en : ar);
  const [remaining, setRemaining] = useState(() => (renewalAt ? remainingParts(renewalAt) : null));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const willShow = status === "تجربة" && !!renewalAt && !!remaining;

  useEffect(() => {
    if (!renewalAt) return;
    const id = window.setInterval(() => setRemaining(remainingParts(renewalAt)), 60_000);
    return () => window.clearInterval(id);
  }, [renewalAt]);

  // The sidebar/main columns size themselves against this so the banner
  // doesn't push the page taller than the viewport (it used to, because the
  // sidebar had a hardcoded 100vh height that didn't know the banner existed).
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) {
      document.documentElement.style.setProperty("--trial-banner-h", "0px");
      return;
    }
    const update = () => document.documentElement.style.setProperty("--trial-banner-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty("--trial-banner-h", "0px");
    };
  }, [willShow]);

  if (!willShow) return null;

  const expired = remaining.msLeft <= 0;
  const timeLabel = expired
    ? t("انتهت فترتك التجريبية", "Your trial has ended")
    : remaining.days > 0
      ? t(`باقي ${remaining.days} يوم و${remaining.hours} ساعة على انتهاء تجربتك المجانية`, `${remaining.days}d ${remaining.hours}h left in your free trial`)
      : remaining.hours > 0
        ? t(`باقي ${remaining.hours} ساعة و${remaining.minutes} دقيقة على انتهاء تجربتك المجانية`, `${remaining.hours}h ${remaining.minutes}m left in your free trial`)
        : t(`باقي ${remaining.minutes} دقيقة على انتهاء تجربتك المجانية`, `${remaining.minutes}m left in your free trial`);

  return (
    <div ref={rootRef} className={`trial-countdown-banner${expired ? " expired" : ""}`} role="status">
      <span className="trial-countdown-text">
        <i className="trial-countdown-icon" aria-hidden="true">⏳</i>
        {timeLabel}
      </span>
      <Link href="/billing" className="trial-countdown-cta">
        {t("الترقية الآن", "Upgrade now")}
        <b aria-hidden="true">{t("←", "→")}</b>
      </Link>
    </div>
  );
}
