"use client";

import { useState } from "react";
import { COMPANY_NAME_MAX, normalizeCompanyName } from "../../../lib/company-name";

type Props = {
  name: string;
  canEdit: boolean;
  language: "ar" | "en";
  onSaved: (name: string) => void;
};

/** The company name in the profile window; the account owner can rename it (app/api/account/company). */
export default function CompanyNameField({ name, canEdit, language, onSaved }: Props) {
  const t = (ar: string, en: string) => (language === "en" ? en : ar);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const checked = normalizeCompanyName(draft);
    if ("error" in checked) {
      setError(language === "en" ? "Enter a company name (at least 2 characters)." : checked.error);
      return;
    }
    setSaving(true);
    setError("");
    const response = await fetch("/api/account/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName: checked.name })
    }).catch(() => null);
    const payload = (await response?.json().catch(() => ({}))) as { companyName?: string; error?: string } | undefined;
    setSaving(false);
    if (!response?.ok || !payload?.companyName) {
      setError(payload?.error || t("تعذر حفظ اسم الشركة", "Could not save the company name"));
      return;
    }
    onSaved(payload.companyName);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="company-name-field">
        <span>{t("اسم الشركة", "Company name")}</span>
        <b>{name || t("غير محدد", "Not set")}</b>
        {canEdit ? <button type="button" className="btn soft company-name-edit" onClick={() => { setDraft(name); setError(""); setEditing(true); }}>{t("تعديل", "Edit")}</button> : null}
      </div>
    );
  }

  return (
    <div className="company-name-field editing">
      <label>
        <span>{t("اسم الشركة", "Company name")}</span>
        <input
          type="text"
          value={draft}
          maxLength={COMPANY_NAME_MAX}
          autoFocus
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void save();
            if (event.key === "Escape") setEditing(false);
          }}
        />
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="company-name-actions">
        <button type="button" className="btn primary" disabled={saving} onClick={() => void save()}>{saving ? t("جاري الحفظ…", "Saving…") : t("حفظ", "Save")}</button>
        <button type="button" className="btn soft" disabled={saving} onClick={() => setEditing(false)}>{t("إلغاء", "Cancel")}</button>
      </div>
    </div>
  );
}
