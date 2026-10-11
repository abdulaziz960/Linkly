"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";

const LABELS_EN: Record<string, string> = { "جديد": "New", "مهتم": "Interested", "غير مهتم": "Not interested", "مؤهل": "Qualified", "غير مؤهل": "Not qualified", "تم البيع": "Sold" };

/** The lead status of a conversation (مهتم، مؤهل...). Changing it sends the mapped event to TikTok Ads when that is enabled. */
export default function LeadStatusControl({ conversationId }: { conversationId: string }) {
  const { t, language } = useLanguage();
  const [status, setStatus] = useState("جديد");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    setNote("");
    fetch(`/api/conversations/${encodeURIComponent(conversationId)}/lead-status`, { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { ok?: boolean; data?: { status: string; statuses: string[] } }) => {
        if (!cancelled && result.ok && result.data) {
          setStatus(result.data.status);
          setStatuses(result.data.statuses);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  async function change(next: string) {
    const previous = status;
    setStatus(next);
    setSaving(true);
    setNote("");
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/lead-status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next })
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; data?: { event?: { sent?: boolean; ok?: boolean; eventName?: string; message?: string } } } | null;
      if (!response.ok || !result?.ok) {
        setStatus(previous);
        setNote(result?.error || t("تعذر حفظ الحالة", "Could not save the status"));
      } else if (result.data?.event?.sent) {
        setNote(result.data.event.ok
          ? t(`أُرسل الحدث ${result.data.event.eventName} إلى TikTok`, `Event ${result.data.event.eventName} sent to TikTok`)
          : t(`تعذر إرسال الحدث إلى TikTok: ${result.data.event.message ?? ""}`, `Could not send the event to TikTok: ${result.data.event.message ?? ""}`));
      }
    } catch {
      setStatus(previous);
      setNote(t("تعذر الاتصال بالخادم", "Could not reach the server"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="lead-status-control">
      <select value={status} disabled={saving || statuses.length === 0} onChange={(event) => void change(event.target.value)} aria-label={t("حالة العميل المحتمل", "Lead status")}>
        {(statuses.length ? statuses : [status]).map((item) => <option key={item} value={item}>{language === "en" ? LABELS_EN[item] ?? item : item}</option>)}
      </select>
      {note ? <small role="status">{note}</small> : null}
    </span>
  );
}
