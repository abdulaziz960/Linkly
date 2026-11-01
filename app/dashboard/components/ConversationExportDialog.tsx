"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../i18n";

function today(offsetDays = 0) {
  const riyadh = new Date(Date.now() + 3 * 3600_000 + offsetDays * 86_400_000);
  return riyadh.toISOString().slice(0, 10);
}

/** Exports the conversations active in a period as a print-ready PDF page or an Excel workbook; what is exported is what the person sees in the inbox. */
export default function ConversationExportDialog({ canSeeNotes, onClose }: { canSeeNotes: boolean; onClose: () => void }) {
  const { t } = useLanguage();
  const [from, setFrom] = useState(today(-6));
  const [to, setTo] = useState(today());
  const [format, setFormat] = useState<"pdf" | "xlsx">("pdf");
  const [notes, setNotes] = useState(false);
  const [attachments, setAttachments] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!from || !to || from > to) { setMessage(t("تأكد أن تاريخ البداية قبل تاريخ النهاية", "The start date must be before the end date")); return; }
    const query = new URLSearchParams({ from, to, format, notes: notes ? "1" : "0", attachments: attachments ? "1" : "0" });
    // The PDF page opens first (inside the click) so the browser does not block it, then is filled once the server answers.
    const page = format === "pdf" ? window.open("", "_blank") : null;
    setBusy(true);
    try {
      const response = await fetch(`/api/conversations/export?${query}`, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        page?.close();
        setMessage(body?.error || t("تعذر تجهيز الملف", "Could not prepare the file"));
        return;
      }
      if (format === "pdf") {
        const html = await response.text();
        if (!page) { setMessage(t("المتصفح منع فتح النافذة. اسمح بالنوافذ المنبثقة وأعد المحاولة.", "The browser blocked the window. Allow pop-ups and try again.")); return; }
        page.document.open();
        page.document.write(html);
        page.document.close();
      } else {
        const url = URL.createObjectURL(await response.blob());
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `conversations-${from}_${to}.xlsx`;
        anchor.click();
        URL.revokeObjectURL(url);
      }
      onClose();
    } catch {
      page?.close();
      setMessage(t("تعذر الاتصال بالخادم", "Could not reach the server"));
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="export-modal" role="dialog" aria-modal="true" aria-label={t("تصدير المحادثات", "Export conversations")} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="export-card" onSubmit={submit}>
        <h2>{t("تصدير المحادثات", "Export conversations")}</h2>
        <p>{t("كل المحادثات التي فيها نشاط خلال الفترة، مع العميل والوسوم والمسؤول عن كل محادثة.", "Every conversation with activity in the period, with its customer, tags and assignee.")}</p>
        <div className="export-dates">
          <label>{t("من", "From")}<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} required /></label>
          <label>{t("إلى", "To")}<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} required /></label>
        </div>
        <div className="export-formats" role="radiogroup" aria-label={t("الصيغة", "Format")}>
          <button type="button" role="radio" aria-checked={format === "pdf"} className={format === "pdf" ? "on" : ""} onClick={() => setFormat("pdf")}><b>PDF</b><small>{t("مرتب للقراءة والطباعة", "Neat for reading and printing")}</small></button>
          <button type="button" role="radio" aria-checked={format === "xlsx"} className={format === "xlsx" ? "on" : ""} onClick={() => setFormat("xlsx")}><b>Excel</b><small>{t("جداول للتحليل", "Tables for analysis")}</small></button>
        </div>
        <label className="export-check"><input type="checkbox" checked={attachments} onChange={(event) => setAttachments(event.target.checked)} />{t("إظهار المرفقات والصور (اسمها ورابطها)", "Show attachments and images (name and link)")}</label>
        {canSeeNotes ? <label className="export-check"><input type="checkbox" checked={notes} onChange={(event) => setNotes(event.target.checked)} />{t("تضمين الملاحظات الداخلية (حساسة)", "Include internal notes (sensitive)")}</label> : null}
        {format === "pdf" ? <small className="export-hint">{t("تفتح صفحة مرتبة، ثم اضغط «طباعة / حفظ PDF» واختر «حفظ بصيغة PDF».", "A neat page opens: press Print / Save PDF, then choose Save as PDF.")}</small> : null}
        {message ? <p className="export-error" role="alert">{message}</p> : null}
        <div className="export-actions">
          <button className="btn primary" type="submit" disabled={busy}>{busy ? t("جارٍ التجهيز…", "Preparing…") : t("تصدير", "Export")}</button>
          <button className="btn secondary" type="button" onClick={onClose}>{t("إلغاء", "Cancel")}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}
