"use client";

import { useState } from "react";
import CustomSelect from "../../components/CustomSelect";
import { useLanguage } from "../i18n";

export type TikTokAdvertiser = { id: string; name: string };

/** Which TikTok ad account sends this workspace its leads, when the advertiser authorized more than one. */
export default function TikTokAdAccountPicker({ advertisers, selectedId, onSelected }: { advertisers: TikTokAdvertiser[]; selectedId: string; onSelected: (advertiserId: string) => void }) {
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function choose(advertiserId: string) {
    if (!advertiserId || advertiserId === selectedId) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/tiktok-ads/connection", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ advertiserId }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || t("تعذر حفظ الاختيار.", "Could not save the choice."));
      onSelected(advertiserId);
      setMessage({ type: "success", text: t("تم اختيار الحساب الإعلاني، وستصل عملاؤه إلى لنكلي.", "Ad account selected: its leads will now arrive in Linkly.") });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : t("تعذر حفظ الاختيار.", "Could not save the choice.") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>
        {t("الحساب الإعلاني", "Ad account")}
        <CustomSelect
          ariaLabel={t("الحساب الإعلاني", "Ad account")}
          value={selectedId}
          disabled={saving}
          onChange={(value) => void choose(value)}
          options={[{ value: "", label: t("اختر الحساب الإعلاني", "Choose the ad account") }, ...advertisers.map((advertiser) => ({ value: advertiser.id, label: advertiser.name ? `${advertiser.name} (${advertiser.id})` : advertiser.id }))]}
        />
      </label>
      <small style={{ opacity: 0.7 }}>{selectedId ? t("تصل الليدات من الحساب المختار فقط.", "Leads arrive from the selected account only.") : t("اختر حسابًا لتبدأ العملاء بالوصول.", "Pick an account to start receiving leads.")}</small>
      {message ? <div className={`automation-feedback ${message.type}`} role="status">{message.text}</div> : null}
    </div>
  );
}
