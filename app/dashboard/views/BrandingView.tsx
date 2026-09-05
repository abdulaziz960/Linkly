"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useLanguage } from "../i18n";

const DEFAULT_BRANDING = { name: "Linkly", logoDataUrl: "/assets/linkly-logo.png", color: "#178a82" };
const MAX_LOGO_BYTES = 500 * 1024;

type FormState = { name: string; logoDataUrl: string; color: string };

export default function BrandingView({ onRefreshData }: { onRefreshData: () => Promise<void> }) {
  const { t } = useLanguage();
  const [form, setForm] = useState<FormState>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function loadBranding() {
    setLoading(true);
    try {
      const response = await fetch("/api/settings/branding");
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok) setForm(body.data);
    } catch {
      // Non-critical - the form simply keeps showing the default branding.
    }
    setLoading(false);
  }

  useEffect(() => {
    loadBranding();
  }, []);

  function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      setError(t("حجم الشعار يجب ألا يتجاوز 500 كيلوبايت", "The logo must not exceed 500KB"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, logoDataUrl: String(reader.result || "") }));
    reader.readAsDataURL(file);
  }

  async function saveBranding(input: FormState) {
    setSaving(true);
    setError("");
    setSuccess(false);

    const response = await fetch("/api/settings/branding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      setError(payload?.error || t("تعذر حفظ العلامة التجارية", "Could not save the branding"));
      setSaving(false);
      return;
    }

    setForm(payload.data);
    setSaving(false);
    setSuccess(true);
    await onRefreshData();
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveBranding(form);
  }

  function resetToDefault() {
    saveBranding({ name: "", logoDataUrl: "", color: "" });
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-head">
          <h2>{t("العلامة التجارية", "Branding")}</h2>
        </div>
        <div className="panel-body">
          <p className="muted-copy">{t("خصّص الاسم والشعار واللون اللي يظهر لفريقك ولعملائك بدل \"Linkly\" - بلوحة التحكم، صفحات الفواتير، الرسائل التلقائية، ورد البوت الآلي.", "Customize the name, logo, and color your team and customers see instead of \"Linkly\" - in the dashboard, billing pages, automated emails, and the bot's auto-reply.")}</p>

          {loading ? <p className="muted-copy">{t("جاري التحميل...", "Loading...")}</p> : (
            <form className="form-grid" onSubmit={submitForm}>
              <label>
                <span>{t("اسم العلامة التجارية", "Brand name")}</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Linkly" maxLength={60} />
              </label>

              <label>
                <span>{t("الشعار", "Logo")}</span>
                <div className="file-picker">
                  <button type="button" onClick={() => document.getElementById("brand-logo-input")?.click()}>{t("تصفح", "Browse")}</button>
                  <span>{t("PNG أو JPG أو SVG، بحد أقصى 500 كيلوبايت", "PNG, JPG, or SVG, up to 500KB")}</span>
                  <input id="brand-logo-input" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoChange} />
                </div>
                {form.logoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.logoDataUrl} alt={form.name || "Logo"} className="brand-logo-preview" />
                ) : null}
              </label>

              <label>
                <span>{t("اللون الأساسي", "Brand color")}</span>
                <div className="brand-color-row">
                  <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(form.color) ? form.color : "#178a82"} onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))} />
                  <input value={form.color} onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))} placeholder="#178a82" maxLength={7} />
                </div>
              </label>

              {error ? <p className="form-error">{error}</p> : null}
              {success && !error ? <p className="field-hint">{t("تم الحفظ بنجاح.", "Saved successfully.")}</p> : null}

              <div className="row-actions">
                <button className="btn soft" type="button" onClick={resetToDefault} disabled={saving}>{t("استعادة الافتراضي", "Reset to default")}</button>
                <button className="btn primary" type="submit" disabled={saving}>{saving ? t("جاري الحفظ", "Saving") : t("حفظ", "Save")}</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
