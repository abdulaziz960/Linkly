"use client";

type MobileTopbarProps = {
  title: string;
  language: "ar" | "en";
  menuOpen: boolean;
  onToggleMenu: () => void;
  onOpenProfile: () => void;
};

export default function MobileTopbar({ title, language, menuOpen, onToggleMenu, onOpenProfile }: MobileTopbarProps) {
  return (
    <header className="mobile-topbar">
      <button type="button" aria-label={language === "ar" ? "فتح القائمة" : "Open menu"} aria-expanded={menuOpen} aria-controls="dashboard-mobile-drawer" onClick={onToggleMenu}>☰</button>
      <b>{title}</b>
      <button type="button" className="mobile-topbar-account" aria-label={language === "ar" ? "الملف الشخصي" : "Profile"} onClick={onOpenProfile}>{language === "ar" ? "حسابي" : "Account"}</button>
    </header>
  );
}
