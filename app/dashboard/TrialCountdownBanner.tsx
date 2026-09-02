"use client";
import { useEffect, useState } from "react";
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
  return { msLeft, days, hours };
}

export default function TrialCountdownBanner({ status, renewalAt, language }: Props) {
  const t = (ar: string, en: string) => (language === "en" ? en : ar);
  const [remaining, setRemaining] = useState(() => (renewalAt ? remainingParts(renewalAt) : null));

  useEffect(() => {
    if (!renewalAt) return;
    const id = window.setInterval(() => setRemaining(remainingParts(renewalAt)), 60_000);
    return () => window.clearInterval(id);
  }, [renewalAt]);

  if (status !== "تجربة" || !renewalAt || !remaining) return null;

  const expired = remaining.msLeft <= 0;
  const timeLabel = expired
    ? t("انتهت فترتك التجريبية", "Your trial has ended")
    : remaining.days > 0
      ? t(`باقي ${remaining.days} يوم و${remaining.hours} ساعة على انتهاء تجربتك المجانية`, `${remaining.days}d ${remaining.hours}h left in your free trial`)
      : t(`باقي ${remaining.hours} ساعة على انتهاء تجربتك المجانية`, `${remaining.hours}h left in your free trial`);

  return (
    <div className={`trial-countdown-banner${expired ? " expired" : ""}`} role="status">
      <span>{timeLabel}</span>
      <Link href="/billing">{t("الترقية الآن ←", "Upgrade now ←")}</Link>
    </div>
  );
}
