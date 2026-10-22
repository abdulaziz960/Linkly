"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import { displayNameProblem, type DisplayNameInfo, type DisplayNameStatus } from "../../../lib/whatsapp-display-name";

const TONE: Record<DisplayNameStatus, string> = { approved: "#15803d", pending: "#b45309", declined: "#c0392b", expired: "#c0392b", none: "#64748b" };

/** Shows the WhatsApp display name with Meta's review state and lets the owner submit a new one to Meta. */
export default function WhatsAppDisplayName() {
  const { t } = useLanguage();
  const [info, setInfo] = useState<DisplayNameInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const label: Record<DisplayNameStatus, string> = {
    approved: t("معتمد من Meta", "Approved by Meta"),
    pending: t("قيد مراجعة Meta", "Pending Meta review"),
    declined: t("رُفض من Meta", "Declined by Meta"),
    expired: t("انتهت صلاحية الطلب", "Request expired"),
    none: t("غير محدد", "Not set")
  };

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/whatsapp/display-name", { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; data?: DisplayNameInfo } | null;
      if (response.ok && result?.ok && result.data) setInfo(result.data);
      else setNote({ ok: false, text: result?.error || t("تعذر جلب حالة الاسم من Meta", "Could not load the name status from Meta") });
    } catch {
      setNote({ ok: false, text: t("تعذر الاتصال بالخادم", "Could not reach the server") });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    const problem = displayNameProblem(draft);
    if (problem) {
      setNote({ ok: false, text: problem });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/whatsapp/display-name", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: draft.trim() }) });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; data?: DisplayNameInfo } | null;
      if (!response.ok || !result?.ok) {
        setNote({ ok: false, text: result?.error || t("رفضت Meta الطلب", "Meta rejected the request") });
        return;
      }
      setEditing(false);
      setNote({ ok: true, text: t("أُرسل الاسم الجديد إلى Meta للمراجعة. تستغرق المراجعة عادةً حتى يومين عمل.", "The new name was sent to Meta for review. Review usually takes up to two business days.") });
      await load();
    } catch {
      setNote({ ok: false, text: t("تعذر الاتصال بالخادم", "Could not reach the server") });
    } finally {
      setBusy(false);
    }
  }

  const pendingRequest = info && info.requestedName && info.requestedName !== info.verifiedName && info.requestedStatus !== "none" ? info : null;

  return (
    <div className="wa-card">
      <strong style={{ fontSize: 14 }}>{t("اسم العرض في واتساب", "WhatsApp display name")}</strong>
      {loading && !info ? <span style={{ fontSize: 13, opacity: 0.7 }}>{t("جارٍ التحميل...", "Loading...")}</span> : null}
      {info ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <b>{info.verifiedName || t("لا يوجد اسم معتمد بعد", "No approved name yet")}</b>
          <span style={{ fontSize: 12, fontWeight: 800, color: TONE[info.status] }}>● {label[info.status]}</span>
        </div>
      ) : null}
      {pendingRequest ? (
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          {t("الاسم المطلوب:", "Requested name:")} <b>{pendingRequest.requestedName}</b>{" "}
          <span style={{ fontWeight: 800, color: TONE[pendingRequest.requestedStatus] }}>● {label[pendingRequest.requestedStatus]}</span>
        </div>
      ) : null}
      {editing ? (
        <div style={{ display: "grid", gap: 8 }}>
          <input value={draft} onChange={(event) => { setDraft(event.target.value); setNote(null); }} maxLength={75} placeholder={t("اسم العرض الجديد", "New display name")} style={{ minHeight: 42, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line, #cfd9d6)", font: "inherit" }} />
          <span style={{ fontSize: 12.5, opacity: 0.7, lineHeight: 1.6 }}>{t("يجب أن يمثل اسم نشاطك التجاري الفعلي، بدون روابط أو إيموجي أو أسماء عامة. تقرر Meta القبول.", "It must represent your actual business: no links, emoji or generic names. Meta decides whether to approve it.")}</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="primary-action" disabled={busy} onClick={() => void submit()}>{busy ? t("جارٍ الإرسال...", "Submitting...") : t("إرسال إلى Meta", "Submit to Meta")}</button>
            <button type="button" className="soft-action" disabled={busy} onClick={() => { setEditing(false); setNote(null); }}>{t("إلغاء", "Cancel")}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="soft-action" onClick={() => { setDraft(info?.verifiedName || ""); setEditing(true); setNote(null); }}>{t("تعديل اسم العرض", "Edit display name")}</button>
          <button type="button" className="soft-action" disabled={loading} onClick={() => void load()}>{t("تحديث الحالة", "Refresh status")}</button>
        </div>
      )}
      {note ? <span style={{ fontSize: 13, color: note.ok ? "#15803d" : "#c0392b" }}>{note.text}</span> : null}
    </div>
  );
}
