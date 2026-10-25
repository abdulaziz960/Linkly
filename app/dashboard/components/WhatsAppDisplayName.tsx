"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import { displayNameProblem, type DisplayNameInfo, type DisplayNameStatus } from "../../../lib/whatsapp-display-name";

/** Meta returns its errors in English; show the common ones in the UI language. */
function localizeMetaError(message: string, ar: boolean): string {
  if (!ar || /[\u0600-\u06FF]/.test(message)) return message;
  if (/already in progress|wait for the current/i.test(message)) return "يوجد طلب تغيير اسم قيد المراجعة لدى Meta. انتظر اكتمال مراجعته قبل طلب اسم آخر.";
  if (/not (been )?approved|violat|policy|guideline/i.test(message)) return "الاسم لا يلتزم بسياسة أسماء العرض في Meta. راجع الشروط أعلاه وجرّب اسمًا آخر.";
  if (/permission|access token|OAuth|expired/i.test(message)) return "لا تملك صلاحية تعديل الاسم، أو انتهت صلاحية الربط. أعد ربط واتساب.";
  if (/rate limit|too many/i.test(message)) return "محاولات كثيرة. حاول مرة أخرى لاحقًا.";
  return `تعذر تنفيذ الطلب من Meta: ${message}`;
}

const TONE: Record<DisplayNameStatus, string> = { approved: "#15803d", pending: "#b45309", declined: "#c0392b", expired: "#c0392b", none: "#64748b" };

/** Shows the WhatsApp display name with Meta's review state and lets the owner submit a new one to Meta. */
export default function WhatsAppDisplayName() {
  const { t, language } = useLanguage();
  const ar = language !== "en";
  const [info, setInfo] = useState<DisplayNameInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [needsPin, setNeedsPin] = useState(false);
  const [pin, setPin] = useState("");

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
      else setNote({ ok: false, text: result?.error ? localizeMetaError(result.error, ar) : t("تعذر جلب حالة الاسم من Meta", "Could not load the name status from Meta") });
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
        setNote({ ok: false, text: result?.error ? localizeMetaError(result.error, ar) : t("رفضت Meta الطلب", "Meta rejected the request") });
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

  /** Meta approved the new name; it takes effect once the number is registered again. */
  async function applyApproved() {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/whatsapp/display-name/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(needsPin ? { pin } : {}) });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (response.status === 409) {
        setNeedsPin(true);
        setNote({ ok: false, text: result?.error || t("أدخل رمز التحقق بخطوتين المكوّن من 6 أرقام.", "Enter your 6-digit two-step verification PIN.") });
        return;
      }
      if (!response.ok || !result?.ok) {
        setNote({ ok: false, text: result?.error || t("تعذر تفعيل الاسم", "Could not apply the name") });
        return;
      }
      setNeedsPin(false);
      setPin("");
      setNote({ ok: true, text: t("تم تفعيل الاسم الجديد. قد يستغرق ظهوره للعملاء بعض الوقت.", "The new name is now in use. It can take a while to show to customers.") });
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
          {pendingRequest.requestedStatus === "pending" ? <div style={{ fontSize: 12.5, opacity: 0.75 }}>{t("لا يمكن طلب اسم آخر قبل اكتمال المراجعة.", "You can’t request another name until the review finishes.")}</div> : null}
        </div>
      ) : null}
      {pendingRequest?.requestedStatus === "approved" ? (
        <div style={{ display: "grid", gap: 8, padding: 12, borderRadius: 12, border: "1px solid #bbf7d0", background: "#f0fdf4" }}>
          <span style={{ fontSize: 13, lineHeight: 1.7 }}>{t("اعتمدت Meta الاسم الجديد، لكنه لا يُستخدم قبل تسجيل الرقم من جديد. اضغط الزر ليبدأ العملاء برؤيته.", "Meta approved the new name, but it is used only after the number is registered again. Press the button to start using it.")}</span>
          {needsPin ? <input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" dir="ltr" placeholder="••••••" aria-label={t("رمز التحقق بخطوتين", "Two-step PIN")} style={{ minHeight: 42, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line, #cfd9d6)", font: "inherit", maxWidth: 200 }} /> : null}
          <div className="wa-card-actions">
            <button type="button" className="primary-action" disabled={busy || (needsPin && pin.length !== 6)} onClick={() => void applyApproved()}>{busy ? t("جارٍ التفعيل...", "Applying...") : t("تفعيل الاسم المعتمد", "Use the approved name")}</button>
          </div>
        </div>
      ) : null}
      {editing ? (
        <div style={{ display: "grid", gap: 8 }}>
          <input value={draft} onChange={(event) => { setDraft(event.target.value); setNote(null); }} maxLength={75} placeholder={t("اسم العرض الجديد", "New display name")} style={{ minHeight: 42, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line, #cfd9d6)", font: "inherit" }} />
          <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 12.5, lineHeight: 1.8, opacity: 0.8 }}>
            <li>{t("اسم نشاطك التجاري الفعلي كما في موقعك أو سجلك التجاري.", "Your real business name, as on your website or registration.")}</li>
            <li>{t("بدون روابط أو إيموجي أو أرقام هواتف أو رموز خاصة.", "No links, emoji, phone numbers or special symbols.")}</li>
            <li>{t("لا اسمًا عامًا مثل «متجر» أو «شركة»، ولا كلمتي Meta وWhatsApp.", "Not a generic name like “Store” or “Company”, and not containing Meta or WhatsApp.")}</li>
            <li>{t("تقرر Meta القبول، وتستغرق المراجعة حتى يومين عمل.", "Meta decides; review takes up to two business days.")}</li>
          </ul>
          <div className="wa-card-actions">
            <button type="button" className="primary-action" disabled={busy} onClick={() => void submit()}>{busy ? t("جارٍ الإرسال...", "Submitting...") : t("إرسال إلى Meta", "Submit to Meta")}</button>
            <button type="button" className="soft-action" disabled={busy} onClick={() => { setEditing(false); setNote(null); }}>{t("إلغاء", "Cancel")}</button>
          </div>
        </div>
      ) : (
        <div className="wa-card-actions">
          {pendingRequest?.requestedStatus === "pending" ? null : <button type="button" className="soft-action" onClick={() => { setDraft(info?.verifiedName || ""); setEditing(true); setNote(null); }}>{t("تعديل اسم العرض", "Edit display name")}</button>}
          <button type="button" className="soft-action" disabled={loading} onClick={() => void load()}>{t("تحديث الحالة", "Refresh status")}</button>
        </div>
      )}
      {note ? <span style={{ fontSize: 13, color: note.ok ? "#15803d" : "#c0392b" }}>{note.text}</span> : null}
    </div>
  );
}
