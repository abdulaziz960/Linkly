"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

type OverlayProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  variant: "dialog" | "drawer";
  size?: "sm" | "md" | "lg";
  // Asked before closing via Esc / backdrop / X. Return false to keep it open
  // (used for "you have unsaved changes").
  beforeClose?: () => boolean;
};

function Overlay({ open, onClose, title, description, children, footer, variant, size = "md", beforeClose }: OverlayProps) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const requestClose = useCallback(() => {
    if (beforeClose && !beforeClose()) return;
    onClose();
  }, [beforeClose, onClose]);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    const firstField = panel?.querySelector<HTMLElement>("[data-autofocus],input,textarea,select");
    (firstField ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((node) => node.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, requestClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="ds-overlay" data-variant={variant} data-theme-scope onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <div ref={panelRef} className="ds-panel" data-size={size} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-desc` : undefined} tabIndex={-1}>
        <header className="ds-panel-head">
          <div>
            <h2 id={`${id}-title`}>{title}</h2>
            {description ? <p id={`${id}-desc`}>{description}</p> : null}
          </div>
          <button type="button" className="ds-icon-btn" aria-label="إغلاق" onClick={requestClose}><Icon name="x" size={18} /></button>
        </header>
        <div className="ds-panel-body">{children}</div>
        {footer ? <footer className="ds-panel-foot">{footer}</footer> : null}
      </div>
    </div>,
    document.querySelector(".admin-shell") ?? document.body
  );
}

export function Dialog(props: Omit<OverlayProps, "variant">) {
  return <Overlay {...props} variant="dialog" />;
}

export function Drawer(props: Omit<OverlayProps, "variant">) {
  return <Overlay {...props} variant="drawer" />;
}

// ----- Confirmation dialogs for sensitive operations -----

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  // When set, the user must type this exact text to enable the confirm button.
  requireText?: string;
};

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState("");

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setTyped("");
    setPending({ ...options, resolve });
  }), []);

  const settle = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  const value = useMemo(() => confirm, [confirm]);
  const blocked = Boolean(pending?.requireText) && typed.trim() !== pending?.requireText;

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog
        open={Boolean(pending)}
        onClose={() => settle(false)}
        title={pending?.title ?? ""}
        description={pending?.description}
        size="sm"
        footer={
          <>
            <button type="button" className="ds-btn" data-variant="ghost" onClick={() => settle(false)}>{pending?.cancelLabel ?? "إلغاء"}</button>
            <button type="button" className="ds-btn" data-variant={pending?.tone === "danger" ? "danger" : "primary"} disabled={blocked} onClick={() => settle(true)}>{pending?.confirmLabel ?? "تأكيد"}</button>
          </>
        }
      >
        {pending?.requireText ? (
          <label className="ds-field">
            <span>اكتب <b dir="ltr">{pending.requireText}</b> للتأكيد</span>
            <input className="ds-input" value={typed} onChange={(event) => setTyped(event.target.value)} dir="ltr" autoComplete="off" />
          </label>
        ) : null}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return confirm;
}
