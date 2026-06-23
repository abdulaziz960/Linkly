"use client";

type MobileTopbarProps = {
  title: string;
  onToggleMenu: () => void;
};

export default function MobileTopbar({ title, onToggleMenu }: MobileTopbarProps) {
  return (
    <header className="mobile-topbar">
      <button type="button" onClick={onToggleMenu}>
        ☰
      </button>
      <b>{title}</b>
    </header>
  );
}
