"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { answerConfirm, dismissNotice, getDialogState, registerDialogHost, subscribeDialogs } from "../../lib/ui-dialogs";
import "./dialog-host.css";

const copy = {
  ar: { confirm: "تأكيد", cancel: "إلغاء", dismiss: "إغلاق الرسالة", title: "تأكيد الإجراء", typeToConfirm: "للتأكيد اكتب:" },
  en: { confirm: "Confirm", cancel: "Cancel", dismiss: "Dismiss message", title: "Please confirm", typeToConfirm: "To confirm, type:" }
} as const;

/**
 * Draws the app's confirmation dialog and toasts (lib/ui-dialogs.ts). Mount it once per page. Right-to-left
 * follows the page; Esc cancels, Tab stays inside the dialog, and focus returns to where it was.
 */
export default function DialogHost({ language = "ar" }: { language?: "ar" | "en" }) {
  const state = useSyncExternalStore(subscribeDialogs, getDialogState, getDialogState);
  const text = copy[language];
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const request = state.confirm;
  const [typed, setTyped] = useState("");
  const requiredText = request?.options.requireText?.trim() ?? "";
  const typedOk = !requiredText || typed.trim() === requiredText;

  useEffect(() => registerDialogHost(), []);

  useEffect(() => {
    if (!request) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // The safe choice is focused first for a destructive question, so a stray Enter doesn't delete anything.
    setTyped("");
    const target = request.options.requireText
      ? dialogRef.current?.querySelector<HTMLElement>("[data-confirm-input]")
      : request.options.tone === "danger" ? dialogRef.current?.querySelector<HTMLElement>("[data-cancel]") : confirmRef.current;
    target?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        answerConfirm(false);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input") || [])];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
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
      previousFocus?.focus?.();
    };
  }, [request]);

  const dir = language === "en" ? "ltr" : "rtl";

  return (
    <>
      {request ? (
        <div className="ui-dialog-backdrop" dir={dir} onMouseDown={(event) => { if (event.target === event.currentTarget) answerConfirm(false); }}>
          <div ref={dialogRef} className="ui-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ui-dialog-title" aria-describedby="ui-dialog-message">
            <h2 id="ui-dialog-title">{request.options.title || text.title}</h2>
            <p id="ui-dialog-message">{request.message}</p>
            {requiredText ? (
              <label className="ui-dialog-type">
                <span>{text.typeToConfirm} <b dir="auto">{requiredText}</b></span>
                <input data-confirm-input value={typed} onChange={(event) => setTyped(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && typedOk) answerConfirm(true); }} autoComplete="off" />
              </label>
            ) : null}
            <div className="ui-dialog-actions">
              <button type="button" className="ui-dialog-cancel" data-cancel onClick={() => answerConfirm(false)}>{request.options.cancelLabel || text.cancel}</button>
              <button ref={confirmRef} type="button" disabled={!typedOk} className={request.options.tone === "danger" ? "ui-dialog-confirm danger" : "ui-dialog-confirm"} onClick={() => answerConfirm(true)}>{request.options.confirmLabel || text.confirm}</button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="ui-toasts" dir={dir} role="region" aria-label={language === "en" ? "Notifications" : "الإشعارات"}>
        {state.notices.map((notice) => (
          <div key={notice.id} className={`ui-toast ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
            <span>{notice.message}</span>
            <button type="button" onClick={() => dismissNotice(notice.id)} aria-label={text.dismiss}>×</button>
          </div>
        ))}
      </div>
    </>
  );
}
