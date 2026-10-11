"use client";

import CustomSelect from "../../components/CustomSelect";
import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";

const LABELS_EN: Record<string, string> = { "جديد": "New", "مهتم": "Interested", "غير مهتم": "Not interested", "مؤهل": "Qualified", "غير مؤهل": "Not qualified", "تم البيع": "Sold" };
const SOLD = "تم البيع";

const controlStyle: React.CSSProperties = { width: "100%", minHeight: 40, padding: "0 10px", borderRadius: 10, border: "1px solid var(--line, #cfd9d6)", background: "var(--surface, #fff)", color: "inherit", font: "inherit", fontWeight: 600 };

/**
 * The lead status of a conversation (مهتم، مؤهل...). Changing it sends the mapped event to TikTok Ads when that is enabled.
 * "تم البيع" is a two-step action: pick it, enter the sale value, confirm - the value goes out with the event.
 */
export default function LeadStatusControl({ conversationId }: { conversationId: string }) {
  const { t, language } = useLanguage();
  const [status, setStatus] = useState("جديد");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [dealValue, setDealValue] = useState("");
  const [pendingSold, setPendingSold] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNote(null);
    setPendingSold(false);
    fetch(`/api/conversations/${encodeURIComponent(conversationId)}/lead-status`, { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { ok?: boolean; data?: { status: string; statuses: string[]; dealValue?: number } }) => {
        if (!cancelled && result.ok && result.data) {
          setStatus(result.data.status);
          setStatuses(result.data.statuses);
          setDealValue(result.data.dealValue ? String(result.data.dealValue) : "");
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  async function save(next: string, withValue: boolean) {
    const previous = status;
    setSaving(true);
    setNote(null);
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/lead-status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, ...(withValue ? { dealValue: dealValue.trim() ? Number(dealValue) : 0 } : {}) })
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; data?: { status: string; event?: { sent?: boolean; ok?: boolean; eventName?: string; message?: string; skipped?: string } } } | null;
      if (!response.ok || !result?.ok) {
        setStatus(previous);
        setNote({ type: "error", text: result?.error || t("تعذر الحفظ", "Could not save") });
        return;
      }
      setStatus(next);
      setPendingSold(false);
      const event = result.data?.event;
      if (event?.sent && event.ok) setNote({ type: "ok", text: t(`تم الحفظ، وأُرسل الحدث ${event.eventName} إلى TikTok`, `Saved, and the ${event.eventName} event was sent to TikTok`) });
      else if (event?.sent) setNote({ type: "error", text: t(`تم الحفظ لكن تعذر إرسال الحدث إلى TikTok: ${event.message ?? ""}`, `Saved, but the event could not be sent to TikTok: ${event.message ?? ""}`) });
      else setNote({ type: "ok", text: t("تم الحفظ", "Saved") });
    } catch {
      setStatus(previous);
      setNote({ type: "error", text: t("تعذر الاتصال بالخادم", "Could not reach the server") });
    } finally {
      setSaving(false);
    }
  }

  function onPick(next: string) {
    setNote(null);
    if (next === SOLD && status !== SOLD) {
      setPendingSold(true); // wait for the value and the confirmation
      return;
    }
    setPendingSold(false);
    void save(next, false);
  }

  const label = (item: string) => (language === "en" ? LABELS_EN[item] ?? item : item);
  const showValue = pendingSold || status === SOLD;

  return (
    <span className="lead-status-control" style={{ display: "grid", gap: 10, width: "100%" }}>
      <CustomSelect value={pendingSold ? SOLD : status} onChange={onPick} disabled={saving || statuses.length === 0} ariaLabel={t("حالة العميل المحتمل", "Lead status")} options={(statuses.length ? statuses : [status]).map((item) => ({ value: item, label: label(item) }))} />

      {showValue ? (
        <span style={{ display: "grid", gap: 8, padding: 12, borderRadius: 12, border: "1px solid var(--line, #dfe7e5)", background: "var(--surface-soft, rgba(0,0,0,0.02))" }}>
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
            {t("قيمة الصفقة (ر.س)", "Deal value (SAR)")}
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              dir="ltr"
              style={controlStyle}
              value={dealValue}
              disabled={saving}
              onChange={(event) => setDealValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void save(SOLD, true);
              }}
              placeholder="0.00"
            />
            <small style={{ fontWeight: 400, opacity: 0.7, lineHeight: 1.6 }}>
              {pendingSold ? t("تُرسل القيمة مع حدث البيع إلى TikTok عند التأكيد.", "The value is sent with the sale event to TikTok when you confirm.") : t("تُحفظ مع المحادثة. الحدث أُرسل عند تسجيل البيع.", "Saved on the conversation. The event was sent when the sale was recorded.")}
            </small>
          </label>
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="primary-action" type="button" disabled={saving} onClick={() => void save(SOLD, true)}>
              {saving ? t("جارٍ الحفظ...", "Saving...") : pendingSold ? t("تأكيد البيع", "Confirm sale") : t("حفظ القيمة", "Save value")}
            </button>
            {pendingSold ? (
              <button className="soft-action" type="button" disabled={saving} onClick={() => setPendingSold(false)}>{t("إلغاء", "Cancel")}</button>
            ) : null}
          </span>
        </span>
      ) : null}

      {note ? <small role="status" style={{ color: note.type === "error" ? "#c0392b" : "#14804a", fontWeight: 600, lineHeight: 1.6 }}>{note.text}</small> : null}
    </span>
  );
}
