"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon, { type IconName } from "./Icon";

export type ActionItem = {
  key: string;
  label: string;
  icon?: IconName;
  href?: string;
  onSelect?: () => void;
  tone?: "danger";
  disabled?: boolean;
};

const MENU_WIDTH = 230;

/**
 * Row-level "more" menu. Rendered in a portal with fixed positioning so a
 * scrolling table wrapper can never clip it, and it flips upward near the
 * bottom of the viewport.
 */
export default function ActionMenu({ label, items }: { label: string; items: ActionItem[] }) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number } | null>(null);

  const close = useCallback(() => setPosition(null), []);

  function toggle() {
    if (position) return close();
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - MENU_WIDTH - 8);
    const estimatedHeight = items.length * 42 + 16;
    const opensUp = rect.bottom + estimatedHeight > window.innerHeight - 8 && rect.top > estimatedHeight;
    setPosition(opensUp ? { bottom: window.innerHeight - rect.top + 6, left } : { top: rect.bottom + 6, left });
  }

  useEffect(() => {
    if (!position) return;
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]:not([disabled])")?.focus();
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [position, close]);

  return (
    <>
      <button ref={triggerRef} type="button" className="ds-icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={Boolean(position)} aria-controls={position ? id : undefined} onClick={toggle}>
        <Icon name="more" size={18} />
      </button>
      {position
        ? createPortal(
            <div ref={menuRef} id={id} role="menu" aria-label={label} className="ds-popover" data-theme-scope style={{ position: "fixed", width: MENU_WIDTH, insetInlineStart: "auto", insetInlineEnd: "auto", top: position.top ?? "auto", bottom: position.bottom ?? "auto", left: position.left }}>
              {items.map((item) => {
                const content = (
                  <>
                    {item.icon ? <Icon name={item.icon} size={17} /> : null}
                    {item.label}
                  </>
                );
                const className = "ds-menu-item";
                if (item.href && !item.disabled) {
                  return <Link key={item.key} href={item.href} role="menuitem" className={className} data-tone={item.tone} onClick={close}>{content}</Link>;
                }
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    className={className}
                    data-tone={item.tone}
                    disabled={item.disabled}
                    onClick={() => {
                      close();
                      item.onSelect?.();
                    }}
                  >
                    {content}
                  </button>
                );
              })}
            </div>,
            document.querySelector(".admin-shell") ?? document.body
          )
        : null}
    </>
  );
}
