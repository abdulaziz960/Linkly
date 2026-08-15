"use client";

import { FormEvent, useMemo, useState } from "react";
import type { AutomationRule, Employee, MessageTemplate, Tag, Team } from "../types";

type AutomationForm = {
  id?: string;
  name: string;
  description: string;
  trigger: string;
  action: string;
  target: string;
  delayMinutes: number;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  enabled: boolean;
};

type AutomationCondition = {
  field: string;
  operator: string;
  value: string;
};

type AutomationAction = {
  type: string;
  target: string;
};

const triggerOptions = ["تم إنشاء رسالة", "تم فتح محادثة", "رد العميل", "تم إغلاق الرسالة"];
const conditionFieldOptions = ["الرسالة تحتوي على", "العميل لديه وسم", "حالة المحادثة", "مصدر الرسالة"];
const conditionOperatorOptions = ["يساوي", "يحتوي", "لا يساوي"];
const actionOptions = ["فتح المحادثة", "إضافة وسم", "إسناد إلى موظف", "إسناد إلى فريق", "إرسال قالب", "إغلاق المحادثة"];
const conversationStatusOptions = ["اختر حالة", "مفتوحة", "غير مسندة", "مسندة", "مغلقة"];
const messageSourceOptions = ["اختر مصدر", "WhatsApp", "المنصة", "حملة", "رد آلي"];

export default function AutomationsView({
  automationRules,
  employees,
  onRefreshData,
  tags,
  teams,
  templates
}: {
  automationRules: AutomationRule[];
  employees: Employee[];
  onRefreshData: () => Promise<void>;
  tags: Tag[];
  teams: Team[];
  templates: MessageTemplate[];
}) {
  const tagOptions = useMemo(() => ["اختر وسم", ...tags.map((tag) => tag.name)], [tags]);
  const employeeOptions = useMemo(() => ["اختر موظف", ...employees.map((employee) => employee.name)], [employees]);
  const teamOptions = useMemo(() => ["اختر فريق", ...teams.map((team) => team.name)], [teams]);
  const templateOptions = useMemo(() => ["اختر قالب", ...templates.map((template) => template.name)], [templates]);

  function withCurrentOption(options: string[], current?: string) {
    return current && !options.includes(current) ? [...options, current] : options;
  }

  function targetOptionsForAction(action: string, current?: string) {
    if (action === "إضافة وسم") return withCurrentOption(tagOptions, current);
    if (action === "إسناد إلى موظف") return withCurrentOption(employeeOptions, current);
    if (action === "إسناد إلى فريق") return withCurrentOption(teamOptions, current);
    if (action === "إرسال قالب") return withCurrentOption(templateOptions, current);
    return ["لا يحتاج اختيار"];
  }

  function defaultTargetForAction(action: string) {
    return targetOptionsForAction(action)[0] || "لا يحتاج اختيار";
  }

  function conditionValueOptions(field: string, current?: string) {
    if (field === "العميل لديه وسم") return withCurrentOption(tagOptions, current);
    if (field === "حالة المحادثة") return conversationStatusOptions;
    if (field === "مصدر الرسالة") return messageSourceOptions;
    return null;
  }

  const emptyForm = useMemo<AutomationForm>(() => ({
    name: "قاعدة جديدة",
    description: "قاعدة جديدة",
    trigger: "تم إنشاء رسالة",
    action: "فتح المحادثة",
    target: "لا يحتاج اختيار",
    delayMinutes: 0,
    conditions: [{ field: "الرسالة تحتوي على", operator: "يساوي", value: "قاعدة جديدة" }],
    actions: [
      { type: "فتح المحادثة", target: "لا يحتاج اختيار" },
      { type: "إضافة وسم", target: "اختر وسم" },
      { type: "إسناد إلى موظف", target: "اختر موظف" }
    ],
    enabled: true
  }), []);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AutomationForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");

  const filteredRules = useMemo(() => {
    const query = search.trim().toLowerCase();

    return automationRules.filter((rule) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "enabled" && rule.enabled) ||
        (statusFilter === "disabled" && !rule.enabled);
      const matchesSearch = query
        ? [rule.name, rule.description, rule.trigger, rule.action, rule.target].join(" ").toLowerCase().includes(query)
        : true;

      return matchesStatus && matchesSearch;
    });
  }, [automationRules, search, statusFilter]);

  function openForm(rule?: AutomationRule, duplicate = false) {
    setForm(rule ? {
      id: duplicate ? undefined : rule.id,
      name: duplicate ? `${rule.name} - نسخة` : rule.name,
      description: rule.description,
      trigger: rule.trigger,
      action: rule.action,
      target: rule.target,
      delayMinutes: rule.delayMinutes,
      conditions: rule.conditions.length ? rule.conditions : [{ field: "الرسالة تحتوي على", operator: "يساوي", value: rule.description || rule.name }],
      actions: rule.actions.length ? rule.actions : [{ type: rule.action, target: rule.target }],
      enabled: rule.enabled
    } : emptyForm);
    setFormOpen(true);
  }

  function updateCondition(index: number, field: keyof AutomationCondition, value: string) {
    setForm((current) => ({
      ...current,
      conditions: current.conditions.map((condition, conditionIndex) =>
        conditionIndex === index
          ? {
              ...condition,
              [field]: value,
              value: field === "field" ? (conditionValueOptions(value)?.[0] || "") : field === "value" ? value : condition.value
            }
          : condition
      )
    }));
  }

  function addCondition() {
    setForm((current) => ({
      ...current,
      conditions: [...current.conditions, { field: "الرسالة تحتوي على", operator: "يساوي", value: "" }]
    }));
  }

  function removeCondition(index: number) {
    setForm((current) => ({
      ...current,
      conditions: current.conditions.filter((_, conditionIndex) => conditionIndex !== index)
    }));
  }

  function updateAction(index: number, field: keyof AutomationAction, value: string) {
    setForm((current) => ({
      ...current,
      actions: current.actions.map((action, actionIndex) => {
        if (actionIndex !== index) return action;
        if (field === "type") return { type: value, target: defaultTargetForAction(value) };
        return { ...action, target: value };
      })
    }));
  }

  function addAction() {
    setForm((current) => ({
      ...current,
      actions: [...current.actions, { type: "فتح المحادثة", target: "لا يحتاج اختيار" }]
    }));
  }

  function removeAction(index: number) {
    setForm((current) => ({
      ...current,
      actions: current.actions.filter((_, actionIndex) => actionIndex !== index)
    }));
  }

  async function submitRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const primaryAction = form.actions[0] ?? { type: "فتح المحادثة", target: "لا يحتاج اختيار" };
    await fetch(form.id ? `/api/automations/${form.id}` : "/api/automations", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        action: primaryAction.type,
        target: primaryAction.target
      })
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
          <p>قواعد تشغيل تلقائية للمحادثات، الوسوم، التعيين، والتنبيهات.</p>
        </div>
        <button className="btn primary" type="button" onClick={() => openForm()}>＋ إضافة قاعدة أتمتة</button>
      </div>

      <div className="panel">
        <div className="panel-head automation-toolbar">
          <h2>قواعد الأتمتة</h2>
          <div className="automation-filters">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث في القواعد..." />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">كل الحالات</option>
              <option value="enabled">المفعلة</option>
              <option value="disabled">المتوقفة</option>
            </select>
          </div>
        </div>
        <div className="panel-body table-wrap">
          <table>
            <thead><tr><th>القاعدة</th><th>عند</th><th>نفذ</th><th>الهدف</th><th>التأخير</th><th>الحالة</th><th /></tr></thead>
            <tbody>
              {filteredRules.map((rule) => (
                <tr key={rule.id}>
                  <td>
                    <b>{rule.name}</b>
                    <small className="table-note">{rule.description || "بدون وصف"}</small>
                  </td>
                  <td><span className="automation-chip">{rule.trigger}</span></td>
                  <td>{rule.action}</td>
                  <td>{rule.target}</td>
                  <td>{rule.delayMinutes ? `${rule.delayMinutes} د` : "فوري"}</td>
                  <td><button className={`toggle ${rule.enabled ? "on" : ""}`} type="button" onClick={() => toggleRule(rule)} /></td>
                  <td className="icon-actions"><button type="button" onClick={() => openForm(rule)}>✎</button><button type="button" onClick={() => openForm(rule, true)}>⧉</button><button type="button" onClick={() => deleteRule(rule)}>⌫</button></td>
                </tr>
              ))}
              {!filteredRules.length ? (
                <tr><td colSpan={7}>لا توجد قواعد مطابقة.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal automation-modal" role="dialog" aria-modal="true" aria-label="حفظ قاعدة أتمتة" onSubmit={submitRule} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label="إغلاق" onClick={() => setFormOpen(false)}>×</button>
              <h2>{form.id ? "تعديل قاعدة أتمتة" : "إضافة قاعدة أتمتة"}</h2>
            </header>
            <div className="account-modal-body automation-builder">
              <label>
                <span>اسم القاعدة</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                <span>الوصف</span>
                <input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
              </label>
              <label>
                <span>الحدث</span>
                <select value={form.trigger} onChange={(event) => setForm((current) => ({ ...current, trigger: event.target.value }))}>
                  {triggerOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>

              <div>
                <h3 className="automation-section-title">الشروط</h3>
                <div className="automation-box">
                  {form.conditions.map((condition, index) => (
                    <div className="automation-row" key={`${condition.field}-${index}`}>
                      <select value={condition.field} onChange={(event) => updateCondition(index, "field", event.target.value)}>
                        {conditionFieldOptions.map((option) => <option key={option}>{option}</option>)}
                      </select>
                      <select value={condition.operator} onChange={(event) => updateCondition(index, "operator", event.target.value)}>
                        {conditionOperatorOptions.map((option) => <option key={option}>{option}</option>)}
                      </select>
                      {conditionValueOptions(condition.field, condition.value) ? (
                        <select value={condition.value} onChange={(event) => updateCondition(index, "value", event.target.value)}>
                          {conditionValueOptions(condition.field, condition.value)?.map((option) => <option key={option}>{option}</option>)}
                        </select>
                      ) : (
                        <input value={condition.value} onChange={(event) => updateCondition(index, "value", event.target.value)} placeholder="اكتب قيمة الشرط" />
                      )}
                      <button className="automation-remove" type="button" onClick={() => removeCondition(index)}>×</button>
                    </div>
                  ))}
                  <button className="btn soft automation-add" type="button" onClick={addCondition}>+ إضافة شرط</button>
                </div>
              </div>

              <div>
                <h3 className="automation-section-title">الإجراءات</h3>
                <div className="automation-box">
                  {form.actions.map((action, index) => (
                    <div className="automation-row action" key={`${action.type}-${index}`}>
                      <select value={action.type} onChange={(event) => updateAction(index, "type", event.target.value)}>
                        {actionOptions.map((option) => <option key={option}>{option}</option>)}
                      </select>
                      <select value={action.target} onChange={(event) => updateAction(index, "target", event.target.value)}>
                        {targetOptionsForAction(action.type, action.target).map((option) => <option key={option}>{option}</option>)}
                      </select>
                      <button className="automation-remove" type="button" onClick={() => removeAction(index)}>×</button>
                    </div>
                  ))}
                  <button className="btn soft automation-add" type="button" onClick={addAction}>+ إضافة إجراء</button>
                </div>
              </div>

              <label className="check-row team-routing">
                <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} />
                <span>تفعيل القاعدة</span>
              </label>
            </div>
            <footer className="modal-foot"><button className="btn soft" type="button" onClick={() => setFormOpen(false)}>إلغاء</button><button className="btn primary" type="submit" disabled={saving}>{saving ? "جاري الحفظ" : "حفظ"}</button></footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
