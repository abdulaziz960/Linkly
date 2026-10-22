"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";

type Settings = { enabled: boolean; inStore: boolean; curbside: boolean; askCarDetails: boolean; note: string };

/** Pickup instead of delivery: in the store, or from the car with the plate number. */
export default function PickupSettingsCard() {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/catalog/pickup", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { ok?: boolean; data?: Settings }) => {
        if (result?.ok && result.data) setSettings(result.data);
      })
      .catch(() => null);
  }, []);

  async function save() {
    if (!settings) return;
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/catalog/pickup", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; data?: Settings } | null;
      if (!response.ok || !result?.ok) {
        setNote({ ok: false, text: result?.error || t("تعذر الحفظ", "Could not save") });
        return;
      }
      if (result.data) setSettings(result.data);
      setNote({ ok: true, text: t("تم الحفظ.", "Saved.") });
    } catch {
      setNote({ ok: false, text: t("تعذر الاتصال بالخادم", "Could not reach the server") });
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return null;
  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch });

  return (
    <div className="loyalty-card pickup-card">
      <h3>{t("الاستلام من المحل", "Pickup")}</h3>
      <p className="muted-copy">{t("يختار العميل قبل الدفع: توصيل أو استلام. وإن اختار الاستلام يختار من السيارة (ويكتب رقم اللوحة) أو بنفسه من المحل. تظهر طريقة الاستلام ورقم اللوحة في الطلب وفي ملاحظة المحادثة وفي الإيصال.", "Before paying, the customer chooses delivery or pickup. For pickup they choose the car (and give the plate number) or coming into the store. The pickup and the plate show in the order, the conversation note and the receipt.")}</p>
      <label className="loyalty-check">
        <input type="checkbox" checked={settings.enabled} onChange={(event) => set({ enabled: event.target.checked })} />
        {t("تفعيل الاستلام من المحل", "Turn pickup on")}
      </label>
      <label className="loyalty-check">
        <input type="checkbox" checked={settings.curbside} onChange={(event) => set({ curbside: event.target.checked })} />
        {t("الاستلام من السيارة (يُطلب رقم اللوحة)", "Pickup from the car (asks for the plate number)")}
      </label>
      <label className="loyalty-check">
        <input type="checkbox" checked={settings.inStore} onChange={(event) => set({ inStore: event.target.checked })} />
        {t("الاستلام بنفسه من المحل", "Customer comes into the store")}
      </label>
      <label className="loyalty-check">
        <input type="checkbox" checked={settings.askCarDetails} onChange={(event) => set({ askCarDetails: event.target.checked })} disabled={!settings.curbside} />
        {t("اطلب أيضًا لون ونوع السيارة", "Also ask the car's colour and type")}
      </label>
      <label>{t("ملاحظة تظهر للعميل (مثل: موقف الاستلام أو ساعات العمل)", "A note shown to the customer (where to park, opening hours...)")}
        <input value={settings.note} maxLength={200} onChange={(event) => set({ note: event.target.value })} />
      </label>
      {note ? <span className={note.ok ? "store-order-ok" : "store-orders-error"}>{note.text}</span> : null}
      <div className="store-order-actions">
        <button type="button" className="primary-action" disabled={busy} onClick={() => void save()}>{busy ? t("جارٍ الحفظ...", "Saving...") : t("حفظ", "Save")}</button>
      </div>
    </div>
  );
}
