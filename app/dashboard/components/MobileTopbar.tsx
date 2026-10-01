"use client";

import NotificationBell, { type NotificationItem } from "./NotificationBell";

type MobileTopbarProps = {
  title: string;
  language: "ar" | "en";
  menuOpen: boolean;
  onToggleMenu: () => void;
  onOpenProfile: () => void;
  notifications?: NotificationItem[];
  onOpenNotification?: (conversationId: string) => void;
};

export default function MobileTopbar({ title, language, menuOpen, onToggleMenu, onOpenProfile, notifications, onOpenNotification }: MobileTopbarProps) {
  return (
    <header className="mobile-topbar">
      <button type="button" aria-label={language === "ar" ? "فتح القائمة" : "Open menu"} aria-expanded={menuOpen} aria-controls="dashboard-mobile-drawer" onClick={onToggleMenu}>☰</button>
      <b>{title}</b>
      {notifications && onOpenNotification ? <NotificationBell notifications={notifications} onOpenNotification={onOpenNotification} /> : null}
      <button type="button" className="mobile-topbar-account" aria-label={language === "ar" ? "الملف الشخصي" : "Profile"} onClick={onOpenProfile}>{language === "ar" ? "حسابي" : "Account"}</button>
    </header>
  );
}
