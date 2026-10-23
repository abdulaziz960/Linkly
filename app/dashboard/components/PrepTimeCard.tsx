"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";

type Settings = { enabled: boolean; defaultMinutes: number };

/** The usual time an order takes to prepare: the customer is told "your order will be ready within N minutes" when they pay. */
export default function PrepTimeCard({ onLoaded }: { onLoaded?: (minutes: number) => void }) {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/catalog/prep", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { ok?: boolean; data?: Settings }) => {
        if (result?.ok && result.data) {
          setSettings(result.data);
          onLoaded?.(result.data.defaultMinutes);
        }
      })
      .catch(() => null);
  }, []);

  async function save() {
    if (!settings) return;
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/catalog/prep", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; data?: Settings } | null;
      if (!response.ok || !result?.ok) {
        setNote({ ok: false, text: result?.error || t("تعذر الحفظ", "Could not save") });
        return;
      }
      if (result.data) {
        setSettings(result.data);
        onLoaded?.(result.data.defaultMinutes);
      }
      setNote({ ok: true, text: t("تم الحفظ.", "Saved.") });
    } catch {
      setNote({ ok: false, text: t("تعذر الاتصال بالخادم", "Could not reach the server") });
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return null;
  return (
    <div className="loyalty-card prep-card">
      <h3>{t("وقت تجهيز الطلب", "Order preparation time")}</h3>
      <p className="muted-copy">{t("يصل العميل بعد دفع طلبه رسالة مثل «سيتم تجهيز طلبك خلال 30 دقيقة». ويمكنك تحديد وقت مختلف لطلب معيّن من قائمة حالة الطلب ← «قيد التجهيز»، فيصله إشعار بالوقت الجديد.", "After paying, the customer gets a message such as “Your order will be ready within 30 minutes”. You can set a different time for one order from its status menu → “Preparing”, and the customer is told the new time.")}</p>
      <label className="loyalty-check">
        <input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} />
        {t("أخبر العميل بوقت التجهيز بعد الدفع", "Tell the customer the preparation time after payment")}
      </label>
      <label>{t("وقت التجهيز المعتاد (بالدقائق)", "Usual preparation time (minutes)")}
        <input type="number" min={1} max={1440} dir="ltr" value={settings.defaultMinutes} onChange={(event) => setSettings({ ...settings, defaultMinutes: Math.max(1, Math.min(1440, Number(event.target.value) || 1)) })} />
      </label>
      {note ? <span className={note.ok ? "store-order-ok" : "store-orders-error"}>{note.text}</span> : null}
      <div className="store-order-actions">
        <button type="button" className="primary-action" disabled={busy} onClick={() => void save()}>{busy ? t("جارٍ الحفظ...", "Saving...") : t("حفظ", "Save")}</button>
      </div>
    </div>
  );
}
