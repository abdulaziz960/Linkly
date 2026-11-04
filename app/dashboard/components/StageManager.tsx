"use client";

import { useState } from "react";
import { pipelineStages } from "../types";
import { useLanguage } from "../i18n";
import { stageDisplayLabel } from "../stage-labels";

/**
 * Add or remove the workspace's own pipeline stages. A custom stage appears on the leads board,
 * in the conversation panel and in the Meta / TikTok / Snapchat event mapping, so a milestone
 * of the client's ("حضر الاجتماع") can be sent to the ad platforms as an event.
 */
export default function StageManager({ stages, onChange, onClose }: { stages: string[]; onChange: (stages: string[]) => void; onClose: () => void }) {
  const { t, language } = useLanguage();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const builtIn = new Set<string>(pipelineStages);
  const lang = language === "en" ? "en" : "ar";

  async function call(method: "POST" | "DELETE", stage: string) {
    setBusy(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/pipeline/stages", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: stage }) }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { ok?: boolean; error?: string; data?: { stages?: string[]; moved?: number } } | null;
    setBusy(false);
    if (!payload?.ok || !payload.data?.stages) {
      setError(payload?.error || t("تعذر حفظ التغيير", "Couldn't save the change"));
      return;
    }
    onChange(payload.data.stages);
    if (method === "POST") setName("");
    if (method === "DELETE" && payload.data.moved) setNotice(t(`نُقل ${payload.data.moved} عميل إلى مرحلة «جديد».`, `${payload.data.moved} lead(s) moved to “New”.`));
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="account-modal form-modal" role="dialog" aria-modal="true" aria-label={t("إدارة المراحل", "Manage stages")} onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={onClose}>×</button>
          <h2>{t("إدارة المراحل", "Manage stages")}</h2>
        </header>
        <div className="account-modal-body" style={{ gridAutoRows: "max-content", alignContent: "start" }}>
          <p style={{ margin: 0, lineHeight: 1.8, opacity: 0.8 }}>
            {t("أضف مراحل خاصة بعملك (مثل «حضر الاجتماع» أو «دفع العربون»). تظهر في لوحة العملاء، وتستطيع ربط كل مرحلة بحدث في ميتا وتيك توك وسناب شات من إعدادات الربط ← ربط الأحداث.", "Add stages of your own (e.g. “Attended the meeting”). They show on the leads board, and each can be mapped to an event in Meta, TikTok and Snapchat under Integrations → Event feedback.")}
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {stages.map((stage) => (
              <li key={stage} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 12px", border: "1px solid var(--line, #dfe7e5)", borderRadius: 10 }}>
                <b>{stageDisplayLabel(stage, lang)}</b>
                {builtIn.has(stage) ? (
                  <span style={{ fontSize: 12, opacity: 0.6 }}>{t("أساسية", "Built-in")}</span>
                ) : (
                  <button type="button" className="btn" disabled={busy} onClick={() => void call("DELETE", stage)} aria-label={t(`حذف ${stage}`, `Delete ${stage}`)}>{t("حذف", "Delete")}</button>
                )}
              </li>
            ))}
          </ul>
          <form
            style={{ display: "flex", gap: 8 }}
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) void call("POST", name);
            }}
          >
            <input style={{ flex: 1, minHeight: 42, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line, #cfd9d6)", font: "inherit" }} aria-label={t("اسم المرحلة الجديدة", "New stage name")} value={name} maxLength={30} onChange={(event) => setName(event.target.value)} placeholder={t("اسم المرحلة الجديدة", "New stage name")} />
            <button type="submit" className="btn primary" disabled={busy || !name.trim()}>{t("إضافة", "Add")}</button>
          </form>
          {error ? <p role="alert" style={{ margin: 0, color: "#b42318" }}>{error}</p> : null}
          {notice ? <p role="status" style={{ margin: 0 }}>{notice}</p> : null}
        </div>
        <footer className="modal-foot">
          <button type="button" className="btn primary" onClick={onClose}>{t("تم", "Done")}</button>
        </footer>
      </div>
    </div>
  );
}
