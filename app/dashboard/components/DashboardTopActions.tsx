"use client";

import type { Ref } from "react";
import Image from "next/image";
import Link from "next/link";
import NotificationBell, { type NotificationItem } from "./NotificationBell";
import PwaInstallButton from "./PwaInstallButton";
import TutorialsLink from "./TutorialsLink";

type Props = {
  containerRef?: Ref<HTMLDivElement>;
  language: "ar" | "en";
  showNotifications: boolean;
  notifications: NotificationItem[];
  onOpenNotification: (conversationId: string) => void;
  profileLogo?: string;
  onOpenProfile: () => void;
  isOwner: boolean;
};

/**
 * The one place for the account's quick actions: tutorials, notifications, profile, support, platform development
 * and billing. Icons alone on small screens (with a tooltip); names beside the icons on large ones.
 */
export default function DashboardTopActions({ containerRef, language, showNotifications, notifications, onOpenNotification, profileLogo, onOpenProfile, isOwner }: Props) {
  const en = language === "en";
  const labels = {
    profile: en ? "Profile" : "الملف الشخصي",
    support: en ? "Support" : "الدعم الفني",
    development: en ? "Development" : "تطوير المنصة",
    billing: en ? "Billing" : "الباقات",
    billingFull: en ? "Plans and billing" : "الباقات والاشتراك"
  };
  const label = (text: string) => <span className="top-action-label">{text}</span>;

  return (
    <div className="dashboard-top-links" ref={containerRef} role="toolbar" aria-label={en ? "Account actions" : "إجراءات الحساب"}>
      <TutorialsLink language={language} />
      <PwaInstallButton />
      {showNotifications ? <NotificationBell notifications={notifications} onOpenNotification={onOpenNotification} /> : null}
      <button type="button" className="sidebar-billing-link is-profile has-label" onClick={onOpenProfile} data-tooltip={labels.profile} aria-label={labels.profile}>
        {profileLogo ? (
          <Image className="dashboard-top-links-photo" src={profileLogo} alt="" width={38} height={38} unoptimized />
        ) : (
          <svg className="dashboard-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4.5 20c1-4.5 4-7 7.5-7s6.5 2.5 7.5 7" /></svg>
        )}
        {label(en ? "My account" : "حسابي")}
      </button>
      <Link className="sidebar-billing-link is-support has-label" href="/dashboard/support" data-tooltip={labels.support} aria-label={labels.support}>
        <svg className="dashboard-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2-2.4 3.6M12 17h.01" /></svg>
        {label(en ? "Support" : "الدعم")}
      </Link>
      <Link className="sidebar-billing-link is-development has-label" href="/dashboard/development" data-tooltip={labels.development} aria-label={labels.development}>
        <svg className="dashboard-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17l-5-5 5-5M15 7l5 5-5 5" /></svg>
        {label(en ? "Development" : "التطوير")}
      </Link>
      {isOwner ? (
        <Link className="sidebar-billing-link is-billing has-label" href="/billing" data-tooltip={labels.billing} aria-label={labels.billingFull}>
          <svg className="dashboard-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18M7 15h4" /></svg>
          {label(labels.billing)}
        </Link>
      ) : null}
    </div>
  );
}
