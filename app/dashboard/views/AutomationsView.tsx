"use client";

import { FormEvent, useMemo, useState } from "react";
import type { AutomationRule, Employee, MessageTemplate, Tag, Team } from "../types";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";

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

// Translates known enum-like Arabic values (triggers, condition fields/operators,
// action types, sentinel placeholders) into the active display language without
// touching the underlying stored/compared value. Values not present in the map
// (tag/employee/team/template names, free text) are returned unchanged since
// they are real data, not fixed UI labels.
function staticLabel(value: string | undefined, t: (ar: string, en: string) => string) {
  if (!value) return "";
  const labels: Record<string, string> = {
    "تم إنشاء رسالة": t("تم إنشاء رسالة", "Message received"),
    "تم فتح محادثة": t("تم فتح محادثة", "Conversation opened"),
    "رد العميل": t("رد العميل", "Customer replied"),
    "تم إغلاق الرسالة": t("تم إغلاق الرسالة", "Message closed"),
    "الرسالة تحتوي على": t("الرسالة تحتوي على", "Message contains"),
    "العميل لديه وسم": t("العميل لديه وسم", "Customer has tag"),
    "حالة المحادثة": t("حالة المحادثة", "Conversation status"),
    "مصدر الرسالة": t("مصدر الرسالة", "Message source"),
    "يساوي": t("يساوي", "Equals"),
    "يحتوي": t("يحتوي", "Contains"),
    "لا يساوي": t("لا يساوي", "Not equal to"),
    "فتح المحادثة": t("فتح المحادثة", "Open conversation"),
    "إضافة وسم": t("إضافة وسم", "Add tag"),
    "إسناد إلى موظف": t("إسناد إلى موظف", "Assign to employee"),
    "إسناد إلى فريق": t("إسناد إلى فريق", "Assign to team"),
    "إرسال قالب": t("إرسال قالب", "Send template"),
    "إغلاق المحادثة": t("إغلاق المحادثة", "Close conversation"),
    "اختر حالة": t("اختر حالة", "Select status"),
    "مفتوحة": t("مفتوحة", "Open"),
    "غير مسندة": t("غير مسندة", "Unassigned"),
    "مسندة": t("مسندة", "Assigned"),
    "مغلقة": t("مغلقة", "Closed"),
    "اختر مصدر": t("اختر مصدر", "Select source"),
    "المنصة": t("المنصة", "Platform"),
    "حملة": t("حملة", "Campaign"),
    "رد آلي": t("رد آلي", "Auto-reply"),
    "لا يحتاج اختيار": t("لا يحتاج اختيار", "No selection needed"),
    "اختر وسم": t("اختر وسم", "Select tag"),
    "اختر موظف": t("اختر موظف", "Select employee"),
    "اختر فريق": t("اختر فريق", "Select team"),
    "اختر قالب": t("اختر قالب", "Select template")
  };
  return labels[value] ?? value;
}

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
  const { t, language } = useLanguage();
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
      trigger: rule.trigger || "",
      action: rule.action || "",
      target: rule.target || "",
      delayMinutes: rule.delayMinutes || 0,
      conditions: rule.conditions?.length ? rule.conditions : [{ field: "الرسالة تحتوي على", operator: "يساوي", value: rule.description || rule.name }],
      actions: rule.actions?.length ? rule.actions : [{ type: rule.action || "", target: rule.target || "" }],
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
    if (!window.confirm(t(`حذف ${rule.name}؟`, `Delete ${rule.name}?`))) return;
    await fetch(`/api/automations/${rule.id}`, { method: "DELETE" });
    await onRefreshData();
  }

  return (
    <section className="page-stack">
      <div className="page-hero">
        <div>
          <h1>{t("الأتمتة", "Automation")}</h1>
          <p>{t("قواعد تشغيل تلقائية للمحادثات، الوسوم، التعيين، والتنبيهات.", "Automatic rules for conversations, tags, assignment, and notifications.")}</p>
        </div>
        <button className="btn primary" type="button" onClick={() => openForm()}>{t("＋ إضافة قاعدة أتمتة", "＋ Add Automation Rule")}</button>
      </div>

      <div className="panel">
        <div className="panel-head automation-toolbar">
          <h2>{t("قواعد الأتمتة", "Automation Rules")}</h2>
          <div className="automation-filters">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("بحث في القواعد...", "Search rules...")} />
            <CustomSelect
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as typeof statusFilter)}
              options={[
                { value: "all", label: t("كل الحالات", "All statuses") },
                { value: "enabled", label: t("المفعلة", "Enabled") },
                { value: "disabled", label: t("المتوقفة", "Disabled") }
              ]}
            />
          </div>
        </div>
        <div className="panel-body table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("القاعدة", "Rule")}</th>
                <th>{t("عند", "When")}</th>
                <th>{t("نفذ", "Do")}</th>
                <th>{t("الهدف", "Target")}</th>
                <th>{t("التأخير", "Delay")}</th>
                <th>{t("الحالة", "Status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredRules.map((rule) => (
                <tr key={rule.id}>
                  <td>
                    <b>{rule.name}</b>
                    <small className="table-note">{rule.description || t("بدون وصف", "No description")}</small>
                  </td>
                  <td><span className="automation-chip">{staticLabel(rule.trigger, t)}</span></td>
                  <td>{staticLabel(rule.action, t)}</td>
                  <td>{staticLabel(rule.target, t)}</td>
                  <td>{rule.delayMinutes ? t(`${rule.delayMinutes} د`, `${rule.delayMinutes}m`) : t("فوري", "Instant")}</td>
                  <td><button className={`toggle ${rule.enabled ? "on" : ""}`} type="button" onClick={() => toggleRule(rule)} /></td>
                  <td className="icon-actions"><button type="button" onClick={() => openForm(rule)}>✎</button><button type="button" onClick={() => openForm(rule, true)}>⧉</button><button type="button" onClick={() => deleteRule(rule)}>⌫</button></td>
                </tr>
              ))}
              {!filteredRules.length ? (
                <tr><td colSpan={7}>{t("لا توجد قواعد مطابقة.", "No matching rules.")}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal automation-modal" role="dialog" aria-modal="true" aria-label={t("حفظ قاعدة أتمتة", "Save automation rule")} onSubmit={submitRule} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setFormOpen(false)}>×</button>
              <h2>{form.id ? t("تعديل قاعدة أتمتة", "Edit Automation Rule") : t("إضافة قاعدة أتمتة", "Add Automation Rule")}</h2>
            </header>
            <div className="account-modal-body automation-builder">
              <label>
                <span>{t("اسم القاعدة", "Rule Name")}</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                <span>{t("الوصف", "Description")}</span>
                <input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
              </label>
              <label>
                <span>{t("الحدث", "Trigger")}</span>
                <CustomSelect
                  value={form.trigger}
                  onChange={(value) => setForm((current) => ({ ...current, trigger: value }))}
                  options={triggerOptions.map((option) => ({ value: option, label: staticLabel(option, t) }))}
                />
              </label>

              <div>
                <h3 className="automation-section-title">{t("الشروط", "Conditions")}</h3>
                <div className="automation-box">
                  {form.conditions.map((condition, index) => (
                    <div className="automation-row" key={`${condition.field}-${index}`}>
                      <CustomSelect
                        value={condition.field}
                        onChange={(value) => updateCondition(index, "field", value)}
                        options={conditionFieldOptions.map((option) => ({ value: option, label: staticLabel(option, t) }))}
                      />
                      <CustomSelect
                        value={condition.operator}
                        onChange={(value) => updateCondition(index, "operator", value)}
                        options={conditionOperatorOptions.map((option) => ({ value: option, label: staticLabel(option, t) }))}
                      />
                      {conditionValueOptions(condition.field, condition.value) ? (
                        <CustomSelect
                          value={condition.value}
                          onChange={(value) => updateCondition(index, "value", value)}
                          options={(conditionValueOptions(condition.field, condition.value) ?? []).map((option) => ({ value: option, label: staticLabel(option, t) }))}
                        />
                      ) : (
                        <input value={condition.value} onChange={(event) => updateCondition(index, "value", event.target.value)} placeholder={t("اكتب قيمة الشرط", "Enter condition value")} />
                      )}
                      <button className="automation-remove" type="button" onClick={() => removeCondition(index)}>×</button>
                    </div>
                  ))}
                  <button className="btn soft automation-add" type="button" onClick={addCondition}>{t("+ إضافة شرط", "+ Add Condition")}</button>
                </div>
              </div>

              <div>
                <h3 className="automation-section-title">{t("الإجراءات", "Actions")}</h3>
                <div className="automation-box">
                  {form.actions.map((action, index) => (
                    <div className="automation-row action" key={`${action.type}-${index}`}>
                      <CustomSelect
                        value={action.type}
                        onChange={(value) => updateAction(index, "type", value)}
                        options={actionOptions.map((option) => ({ value: option, label: staticLabel(option, t) }))}
                      />
                      <CustomSelect
                        value={action.target}
                        onChange={(value) => updateAction(index, "target", value)}
                        options={targetOptionsForAction(action.type, action.target).map((option) => ({ value: option, label: staticLabel(option, t) }))}
                      />
                      <button className="automation-remove" type="button" onClick={() => removeAction(index)}>×</button>
                    </div>
                  ))}
                  <button className="btn soft automation-add" type="button" onClick={addAction}>{t("+ إضافة إجراء", "+ Add Action")}</button>
                </div>
              </div>

              <label className="check-row team-routing">
                <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} />
                <span>{t("تفعيل القاعدة", "Enable rule")}</span>
              </label>
            </div>
            <footer className="modal-foot"><button className="btn soft" type="button" onClick={() => setFormOpen(false)}>{t("إلغاء", "Cancel")}</button><button className="btn primary" type="submit" disabled={saving}>{saving ? t("جاري الحفظ", "Saving...") : t("حفظ", "Save")}</button></footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
