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
  const totalSeconds = Math.max(0, Math.floor(msLeft / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { msLeft, days, hours, minutes, seconds };
}

const pad = (n: number) => String(n).padStart(2, "0");

export default function TrialCountdownBanner({ status, renewalAt, language }: Props) {
  const t = (ar: string, en: string) => (language === "en" ? en : ar);
  const [remaining, setRemaining] = useState(() => (renewalAt ? remainingParts(renewalAt) : null));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const willShow = status === "تجربة" && !!renewalAt && !!remaining && remaining.msLeft > 0;

  useEffect(() => {
    if (!renewalAt) return;
    const id = window.setInterval(() => setRemaining(remainingParts(renewalAt)), 1000);
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

  if (status !== "تجربة" || !renewalAt || !remaining) return null;

  const expired = remaining.msLeft <= 0;

  if (expired) {
    return (
      <div ref={rootRef} className="trial-countdown-banner expired" role="status">
        <div className="trial-countdown-pill">
          <i className="trial-countdown-icon" aria-hidden="true">⏳</i>
          <span className="trial-countdown-text">{t("انتهت فترتك التجريبية", "Your trial has ended")}</span>
          <Link href="/billing" className="trial-countdown-cta">
            {t("الترقية الآن", "Upgrade now")}
            <b aria-hidden="true">{t("←", "→")}</b>
          </Link>
        </div>
      </div>
    );
  }

  const segments = [
    remaining.days > 0 ? { value: remaining.days, label: t("يوم", "d") } : null,
    { value: remaining.hours, label: t("س", "h") },
    { value: remaining.minutes, label: t("د", "m") },
    { value: remaining.seconds, label: t("ث", "s") }
  ].filter(Boolean) as { value: number; label: string }[];

  return (
    <div ref={rootRef} className="trial-countdown-banner" role="status">
      <div className="trial-countdown-pill">
        <i className="trial-countdown-icon" aria-hidden="true">⏳</i>
        <span className="trial-countdown-text">{t("تجربتك تنتهي خلال", "Trial ends in")}</span>
        <span className="trial-countdown-clock" aria-live="off">
          {segments.map((segment) => (
            <span className="trial-countdown-segment" key={segment.label}>
              <b>{pad(segment.value)}</b>
              <small>{segment.label}</small>
            </span>
          ))}
        </span>
        <Link href="/billing" className="trial-countdown-cta">
          {t("الترقية الآن", "Upgrade now")}
          <b aria-hidden="true">{t("←", "→")}</b>
        </Link>
      </div>
    </div>
  );
}
