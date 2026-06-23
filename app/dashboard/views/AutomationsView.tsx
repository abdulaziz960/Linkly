"use client";

import { FormEvent, useMemo, useState } from "react";
import type { AutomationRule } from "../types";

type AutomationForm = {
  id?: string;
  name: string;
  description: string;
  enabled: boolean;
};

export default function AutomationsView({
  automationRules,
  onRefreshData
}: {
  automationRules: AutomationRule[];
  onRefreshData: () => Promise<void>;
}) {
  const emptyForm = useMemo<AutomationForm>(() => ({ name: "", description: "", enabled: true }), []);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AutomationForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  function openForm(rule?: AutomationRule) {
    setForm(rule ? { id: rule.id, name: rule.name, description: rule.description, enabled: rule.enabled } : emptyForm);
    setFormOpen(true);
  }

  async function submitRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await fetch(form.id ? `/api/automations/${form.id}` : "/api/automations", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    await onRefreshData();
    setSaving(false);
    setFormOpen(false);
  }

  async function toggleRule(rule: AutomationRule) {
    await fetch(`/api/automations/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled })
    });
    await onRefreshData();
  }

  async function deleteRule(rule: AutomationRule) {
    if (!window.confirm(`حذف ${rule.name}؟`)) return;
    await fetch(`/api/automations/${rule.id}`, { method: "DELETE" });
    await onRefreshData();
  }

  return (
    <section className="page-stack">
      <div className="page-hero">
        <div>
          <h1>الأتمتة</h1>
          <p>يمكن للأتمتة أن تحل محل وتبسط العمليات القائمة التي تتطلب جهداً يدوياً، مثل إضافة تسميات وتعيين المحادثات إلى أنسب وكيل، ويسمح ذلك للفريق بالتركيز على مواطن قوتهم مع تقليل الوقت الذي يقضيه في المهام الروتينية.</p>
        </div>
        <button className="btn primary" type="button" onClick={() => openForm()}>＋ إضافة قاعدة أتمتة</button>
      </div>
      <div className="panel">
        <div className="panel-body table-wrap">
          <table>
            <thead><tr><th>الاسم</th><th>الوصف</th><th>مفعل</th><th>تم إنشاؤها في</th><th /></tr></thead>
            <tbody>
              {automationRules.map((rule) => (
                <tr key={rule.id}>
                  <td>{rule.name}</td><td>{rule.description}</td><td><button className={`toggle ${rule.enabled ? "on" : ""}`} type="button" onClick={() => toggleRule(rule)} /></td><td>{rule.createdAt}</td>
                  <td className="icon-actions"><button type="button" onClick={() => openForm(rule)}>✎</button><button type="button" onClick={() => openForm()}>⧉</button><button type="button" onClick={() => deleteRule(rule)}>⌫</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal" role="dialog" aria-modal="true" aria-label="حفظ قاعدة أتمتة" onSubmit={submitRule} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head"><button className="icon-btn" type="button" aria-label="إغلاق" onClick={() => setFormOpen(false)}>×</button><h2>{form.id ? "تعديل قاعدة أتمتة" : "إضافة قاعدة أتمتة"}</h2></header>
            <div className="account-modal-body form-grid">
              <label><span>اسم القاعدة</span><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></label>
              <label><span>الوصف</span><textarea rows={4} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
              <label className="check-row team-routing"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} /><span>تفعيل القاعدة</span></label>
            </div>
            <footer className="modal-foot"><button className="btn soft" type="button" onClick={() => setFormOpen(false)}>إلغاء</button><button className="btn primary" type="submit" disabled={saving}>{saving ? "جاري الحفظ" : "حفظ"}</button></footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
