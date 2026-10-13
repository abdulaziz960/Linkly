"use client";

import { useEffect, useState } from "react";
import CustomSelect from "../../components/CustomSelect";
import { useLanguage } from "../i18n";

type Account = { id: string; name: string; organizationName: string };

/** Which Snapchat ad account this workspace receives leads from, when the member has more than one. */
export default function SnapAdAccountPicker() {
  const { t } = useLanguage();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/snapchat/ad-accounts", { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, payload: await response.json().catch(() => null) }))
      .then(({ ok, payload }) => {
        if (cancelled) return;
        if (!ok || !payload?.ok) {
          setMessage({ type: "error", text: payload?.error || t("تعذر جلب الحسابات الإعلانية.", "Could not load the ad accounts.") });
          return;
        }
        setAccounts(payload.data.accounts);
        setSelectedId(payload.data.selectedId);
      })
      .catch(() => !cancelled && setMessage({ type: "error", text: t("تعذر جلب الحسابات الإعلانية.", "Could not load the ad accounts.") }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function choose(adAccountId: string) {
    const previous = selectedId;
    setSelectedId(adAccountId);
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/snapchat/ad-accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || t("تعذر حفظ الاختيار.", "Could not save the choice."));
      setMessage({ type: "success", text: t("تم اختيار الحساب الإعلاني.", "Ad account selected.") });
    } catch (error) {
      setSelectedId(previous);
      setMessage({ type: "error", text: error instanceof Error ? error.message : t("تعذر حفظ الاختيار.", "Could not save the choice.") });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p style={{ margin: 0, opacity: 0.7 }}>{t("جارٍ جلب الحسابات الإعلانية...", "Loading ad accounts...")}</p>;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>
        {t("الحساب الإعلاني", "Ad account")}
        {accounts.length ? (
          <CustomSelect
            ariaLabel={t("الحساب الإعلاني", "Ad account")}
            value={selectedId}
            disabled={saving}
            onChange={(value) => void choose(value)}
            options={accounts.map((account) => ({ value: account.id, label: account.organizationName ? `${account.name} — ${account.organizationName}` : account.name }))}
          />
        ) : (
          <span style={{ fontWeight: 400, opacity: 0.75 }}>{t("لا توجد حسابات إعلانية متاحة لحسابك في سناب.", "No ad accounts are available for your Snapchat account.")}</span>
        )}
      </label>
      {accounts.length > 1 ? <small style={{ opacity: 0.7 }}>{t("تصل الليدات من الحساب المختار فقط.", "Leads arrive from the selected account only.")}</small> : null}
      {message ? <div className={`automation-feedback ${message.type}`} role="status">{message.text}</div> : null}
    </div>
  );
}
