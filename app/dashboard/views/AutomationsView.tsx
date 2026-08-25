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

type AutomationPreset = {
  id: string;
  icon: string;
  title: string;
  description: string;
  form: AutomationForm;
  available?: boolean;
  requirement?: string;
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
  const { t } = useLanguage();
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
    name: "",
    description: "",
    trigger: "تم إنشاء رسالة",
    action: "فتح المحادثة",
    target: "لا يحتاج اختيار",
    delayMinutes: 0,
    conditions: [],
    actions: [{ type: "فتح المحادثة", target: "لا يحتاج اختيار" }],
    enabled: true
  }), []);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AutomationForm>(emptyForm);
  const [builderStep, setBuilderStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");

  const presets = useMemo<AutomationPreset[]>(() => {
    const firstTeam = teams[0]?.name || "اختر فريق";
    const firstTag = tags[0]?.name || "اختر وسم";
    const firstTemplate = templates[0]?.name || "اختر قالب";
    return [
      {
        id: "route-new",
        icon: "↗",
        title: "توزيع المحادثات الجديدة",
        description: "حوّل أي محادثة غير مسندة إلى فريقك مباشرة.",
        form: { ...emptyForm, name: "توزيع المحادثات الجديدة", description: "إسناد المحادثات غير المسندة للفريق تلقائيًا", trigger: "تم فتح محادثة", conditions: [{ field: "حالة المحادثة", operator: "يساوي", value: "غير مسندة" }], actions: [{ type: "إسناد إلى فريق", target: firstTeam }] },
        available: teams.length > 0,
        requirement: t("أنشئ فريقًا أولًا", "Create a team first")
      },
      {
        id: "tag-keyword",
        icon: "◇",
        title: "وسم حسب كلمة مفتاحية",
        description: "أضف وسمًا عندما يكتب العميل كلمة تحددها.",
        form: { ...emptyForm, name: "تصنيف العملاء تلقائيًا", description: "إضافة وسم حسب محتوى الرسالة", trigger: "تم إنشاء رسالة", conditions: [{ field: "الرسالة تحتوي على", operator: "يحتوي", value: "سعر" }], actions: [{ type: "إضافة وسم", target: firstTag }] },
        available: tags.length > 0,
        requirement: t("أنشئ وسمًا أولًا", "Create a tag first")
      },
      {
        id: "send-template",
        icon: "✉",
        title: "إرسال رد جاهز",
        description: "أرسل قالبًا مناسبًا فور وصول سؤال متكرر.",
        form: { ...emptyForm, name: "الرد على الأسئلة المتكررة", description: "إرسال قالب تلقائي حسب رسالة العميل", trigger: "رد العميل", conditions: [{ field: "الرسالة تحتوي على", operator: "يحتوي", value: "الأسعار" }], actions: [{ type: "إرسال قالب", target: firstTemplate }] },
        available: templates.length > 0,
        requirement: t("أنشئ قالبًا أولًا", "Create a template first")
      },
      {
        id: "close-thanks",
        icon: "✓",
        title: "إغلاق المحادثة المكتملة",
        description: "أغلق المحادثة بعد تأكيد العميل انتهاء الطلب.",
        form: { ...emptyForm, name: "إغلاق المحادثة المكتملة", description: "إغلاق المحادثة بعد رسالة الشكر", trigger: "رد العميل", conditions: [{ field: "الرسالة تحتوي على", operator: "يحتوي", value: "شكراً" }], actions: [{ type: "إغلاق المحادثة", target: "لا يحتاج اختيار" }] }
      }
    ];
  }, [emptyForm, tags, teams, templates, t]);

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
    setBuilderStep(1);
    setFeedback(null);
    setFormOpen(true);
  }

  function openPreset(preset: AutomationPreset) {
    setForm({ ...preset.form, conditions: preset.form.conditions.map((condition) => ({ ...condition })), actions: preset.form.actions.map((action) => ({ ...action })) });
    setBuilderStep(1);
    setFeedback(null);
    setFormOpen(true);
  }

  function nextBuilderStep() {
    if (builderStep === 1 && !form.name.trim()) {
      setFeedback({ type: "error", message: t("اكتب اسمًا واضحًا للقاعدة أولًا.", "Enter a clear rule name first.") });
      return;
    }
    if (builderStep === 2 && form.conditions.some((condition) => !condition.value.trim() || condition.value.startsWith("اختر "))) {
      setFeedback({ type: "error", message: t("أكمل قيمة كل شرط أو احذف الشرط غير المطلوب.", "Complete every condition or remove the one you do not need.") });
      return;
    }
    if (builderStep === 3 && !form.actions.length) {
      setFeedback({ type: "error", message: t("أضف إجراءً واحدًا على الأقل.", "Add at least one action.") });
      return;
    }
    if (builderStep === 3 && form.actions.some((action) => action.target.startsWith("اختر "))) {
      setFeedback({ type: "error", message: t("اختر الهدف المطلوب لكل إجراء قبل المتابعة.", "Choose a target for every action before continuing.") });
      return;
    }
    setFeedback(null);
    setBuilderStep((current) => Math.min(4, current + 1));
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
    if (builderStep < 4) {
      nextBuilderStep();
      return;
    }
    setSaving(true);
    setFeedback(null);
    const primaryAction = form.actions[0] ?? { type: "فتح المحادثة", target: "لا يحتاج اختيار" };
    try {
      const response = await fetch(form.id ? `/api/automations/${form.id}` : "/api/automations", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          action: primaryAction.type,
          target: primaryAction.target
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || t("تعذر حفظ قاعدة الأتمتة.", "Could not save the automation rule."));
      await onRefreshData();
      setFormOpen(false);
      setFeedback({ type: "success", message: t("تم حفظ قاعدة الأتمتة بنجاح.", "Automation rule saved successfully.") });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : t("تعذر حفظ قاعدة الأتمتة.", "Could not save the automation rule.") });
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(rule: AutomationRule) {
    setFeedback(null);
    try {
      const response = await fetch(`/api/automations/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled })
      });
      if (!response.ok) throw new Error(t("تعذر تغيير حالة القاعدة.", "Could not update the rule status."));
      await onRefreshData();
      setFeedback({ type: "success", message: rule.enabled ? t("تم إيقاف القاعدة.", "Rule disabled.") : t("تم تشغيل القاعدة.", "Rule enabled.") });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : t("تعذر تغيير حالة القاعدة.", "Could not update the rule status.") });
    }
  }

  async function deleteRule(rule: AutomationRule) {
    if (!window.confirm(t(`حذف ${rule.name}؟`, `Delete ${rule.name}?`))) return;
    setFeedback(null);
    try {
      const response = await fetch(`/api/automations/${rule.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(t("تعذر حذف القاعدة.", "Could not delete the rule."));
      await onRefreshData();
      setFeedback({ type: "success", message: t("تم حذف القاعدة.", "Rule deleted.") });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : t("تعذر حذف القاعدة.", "Could not delete the rule.") });
    }
  }

  const enabledCount = automationRules.filter((rule) => rule.enabled).length;
  const totalActions = automationRules.reduce((total, rule) => total + Math.max(1, rule.actions?.length || 0), 0);

  function ruleSummary(rule: AutomationRule) {
    const condition = rule.conditions?.[0];
    const conditionText = condition ? `${staticLabel(condition.field, t)} ${staticLabel(condition.operator, t)} “${staticLabel(condition.value, t)}”` : t("بدون شروط إضافية", "No extra conditions");
    const action = rule.actions?.[0] || { type: rule.action, target: rule.target };
    const target = action.target && action.target !== "لا يحتاج اختيار" ? ` ← ${staticLabel(action.target, t)}` : "";
    return { conditionText, actionText: `${staticLabel(action.type, t)}${target}` };
  }

  return (
    <section className="page-stack">
      <div className="page-hero">
        <div>
          <h1>{t("الأتمتة", "Automation")}</h1>
          <p>{t("خلّ المهام المتكررة تعمل وحدها: اختر متى تبدأ القاعدة، ثم حدد ما الذي تريد من Linkly تنفيذه.", "Let repetitive tasks run themselves: choose when the rule starts, then decide what Linkly should do.")}</p>
        </div>
        <button className="btn primary" type="button" onClick={() => openForm()}>{t("＋ إنشاء أتمتة", "＋ Create automation")}</button>
      </div>

      {feedback && !formOpen ? <p className={`automation-feedback ${feedback.type}`} role="status">{feedback.message}</p> : null}

      <div className="automation-overview" aria-label={t("ملخص الأتمتة", "Automation overview")}>
        <article><span>⚡</span><div><b>{automationRules.length}</b><small>{t("إجمالي القواعد", "Total rules")}</small></div></article>
        <article><span>✓</span><div><b>{enabledCount}</b><small>{t("قواعد تعمل الآن", "Rules running now")}</small></div></article>
        <article><span>↗</span><div><b>{totalActions}</b><small>{t("إجراءات تلقائية", "Automated actions")}</small></div></article>
      </div>

      <section className="automation-recipes" aria-labelledby="automation-recipes-title">
        <div className="automation-recipes-head">
          <div><span>{t("ابدأ بسرعة", "Quick start")}</span><h2 id="automation-recipes-title">{t("قوالب جاهزة للاستخدام", "Ready-to-use recipes")}</h2></div>
          <small>{t("اختر الأقرب لاحتياجك ثم عدّل الكلمات أو الفريق قبل الحفظ.", "Choose the closest recipe, then adjust its words or team before saving.")}</small>
        </div>
        <div className="automation-recipe-grid">
          {presets.map((preset) => (
            <button key={preset.id} type="button" className="automation-recipe-card" disabled={preset.available === false} onClick={() => openPreset(preset)}>
              <span aria-hidden="true">{preset.icon}</span>
              <div><b>{preset.title}</b><small>{preset.description}</small></div>
              <em>{preset.available === false ? preset.requirement : `${t("استخدم القالب", "Use recipe")} ←`}</em>
            </button>
          ))}
        </div>
      </section>

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
        <div className="panel-body automation-rule-list">
          {filteredRules.map((rule) => {
            const summary = ruleSummary(rule);
            return (
              <article className={`automation-rule-card ${rule.enabled ? "enabled" : "disabled"}`} key={rule.id}>
                <div className="automation-rule-top">
                  <span className="automation-rule-icon" aria-hidden="true">⚡</span>
                  <div><h3>{rule.name}</h3><p>{rule.description || t("بدون وصف", "No description")}</p></div>
                  <label className="automation-switch">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      aria-label={rule.enabled ? t("إيقاف الأتمتة", "Disable automation") : t("تشغيل الأتمتة", "Enable automation")}
                      onChange={() => void toggleRule(rule)}
                    />
                    <span>{rule.enabled ? t("تعمل", "Active") : t("متوقفة", "Paused")}</span>
                  </label>
                </div>
                <div className="automation-flow-summary">
                  <div><small>{t("عندما", "When")}</small><b>{staticLabel(rule.trigger, t)}</b></div>
                  <span aria-hidden="true">←</span>
                  <div><small>{t("إذا", "If")}</small><b>{summary.conditionText}</b></div>
                  <span aria-hidden="true">←</span>
                  <div><small>{t("ينفّذ", "Then")}</small><b>{summary.actionText}</b></div>
                </div>
                <div className="automation-rule-foot">
                  <span>{rule.delayMinutes ? t(`بعد ${rule.delayMinutes} دقيقة`, `After ${rule.delayMinutes} minutes`) : t("تنفيذ فوري", "Runs instantly")}</span>
                  <div>
                    <button type="button" onClick={() => openForm(rule)}>✎ {t("تعديل", "Edit")}</button>
                    <button type="button" onClick={() => openForm(rule, true)}>⧉ {t("نسخ", "Duplicate")}</button>
                    <button className="danger" type="button" onClick={() => void deleteRule(rule)}>⌫ {t("حذف", "Delete")}</button>
                  </div>
                </div>
              </article>
            );
          })}
          {!filteredRules.length ? (
            <div className="automation-empty"><span>⚡</span><b>{t("لا توجد قواعد مطابقة", "No matching rules")}</b><small>{t("جرّب تغيير البحث أو ابدأ بأحد القوالب الجاهزة بالأعلى.", "Change the filters or start with one of the ready recipes above.")}</small></div>
          ) : null}
        </div>
      </div>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <form className="account-modal form-modal automation-modal" role="dialog" aria-modal="true" aria-label={t("حفظ قاعدة أتمتة", "Save automation rule")} onSubmit={submitRule} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setFormOpen(false)}>×</button>
              <h2>{form.id ? t("تعديل قاعدة أتمتة", "Edit Automation Rule") : t("إضافة قاعدة أتمتة", "Add Automation Rule")}</h2>
            </header>
            <div className="automation-stepper" aria-label={t("مراحل إنشاء الأتمتة", "Automation setup steps")}>
              {[
                t("التعريف", "Basics"),
                t("متى تعمل", "When"),
                t("ماذا تنفذ", "Actions"),
                t("المراجعة", "Review")
              ].map((label, index) => (
                <button key={label} type="button" className={builderStep === index + 1 ? "active" : builderStep > index + 1 ? "done" : ""} onClick={() => index + 1 < builderStep && setBuilderStep(index + 1)}>
                  <span>{builderStep > index + 1 ? "✓" : index + 1}</span><b>{label}</b>
                </button>
              ))}
            </div>
            <div className="account-modal-body automation-builder">
              {feedback ? <p className={`automation-feedback ${feedback.type}`} role="status">{feedback.message}</p> : null}

              {builderStep === 1 ? (
                <div className="automation-step-content">
                  <div className="automation-step-intro"><span>1</span><div><h3>{t("عرّف القاعدة", "Name the rule")}</h3><p>{t("اختر اسمًا يشرح النتيجة حتى يعرف فريقك وظيفتها بسرعة.", "Choose a name that explains the result so your team understands it quickly.")}</p></div></div>
                  <label>
                    <span>{t("اسم القاعدة", "Rule Name")}</span>
                    <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("مثال: توزيع محادثات المبيعات", "Example: Route sales conversations")} required />
                  </label>
                  <label>
                    <span>{t("وصف مختصر (اختياري)", "Short description (optional)")}</span>
                    <input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder={t("اشرح لفريقك ماذا تفعل هذه القاعدة", "Explain what this rule does")} />
                  </label>
                </div>
              ) : null}

              {builderStep === 2 ? (
              <div className="automation-step-content">
                <div className="automation-step-intro"><span>2</span><div><h3>{t("متى تبدأ القاعدة؟", "When should it start?")}</h3><p>{t("حدد الحدث، ثم أضف شروطًا فقط إذا كنت تريد تضييق الحالات.", "Choose the event, then add conditions only when you need to narrow it down.")}</p></div></div>
                <label>
                  <span>{t("ابدأ عندما", "Start when")}</span>
                  <CustomSelect
                    value={form.trigger}
                    onChange={(value) => setForm((current) => ({ ...current, trigger: value }))}
                    options={triggerOptions.map((option) => ({ value: option, label: staticLabel(option, t) }))}
                  />
                </label>

              <div>
                <h3 className="automation-section-title">{t("الشروط الاختيارية", "Optional conditions")}</h3>
                <div className="automation-box">
                  {!form.conditions.length ? <p className="automation-inline-empty">{t("بدون شروط: ستعمل القاعدة على كل الحالات التي تحقق الحدث أعلاه.", "No conditions: the rule will run for every matching event.")}</p> : null}
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
              </div>
              ) : null}

              {builderStep === 3 ? (
              <div className="automation-step-content">
                <div className="automation-step-intro"><span>3</span><div><h3>{t("ماذا تريد أن يحدث؟", "What should happen?")}</h3><p>{t("رتّب إجراءً أو أكثر وسيتم تنفيذها بالترتيب.", "Add one or more actions and they will run in order.")}</p></div></div>
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

              <label>
                <span>{t("التأخير قبل التنفيذ (بالدقائق)", "Delay before running (minutes)")}</span>
                <input type="number" min={0} max={10080} value={form.delayMinutes} onChange={(event) => setForm((current) => ({ ...current, delayMinutes: Math.max(0, Number(event.target.value) || 0) }))} />
                <small className="field-hint">{form.delayMinutes ? t(`سيبدأ التنفيذ بعد ${form.delayMinutes} دقيقة.`, `Runs after ${form.delayMinutes} minutes.`) : t("اتركها 0 للتنفيذ الفوري.", "Keep it at 0 to run instantly.")}</small>
              </label>
              </div>
              ) : null}

              {builderStep === 4 ? (
                <div className="automation-step-content">
                  <div className="automation-step-intro"><span>4</span><div><h3>{t("راجع قبل التشغيل", "Review before enabling")}</h3><p>{t("هذا هو المسار الذي سينفذه Linkly تلقائيًا.", "This is the flow Linkly will run automatically.")}</p></div></div>
                  <div className="automation-review-card">
                    <div><small>{t("القاعدة", "Rule")}</small><b>{form.name}</b><p>{form.description || t("بدون وصف", "No description")}</p></div>
                    <div className="automation-review-flow">
                      <article><small>{t("عندما", "When")}</small><b>{staticLabel(form.trigger, t)}</b></article>
                      <span>←</span>
                      <article><small>{t("الشروط", "Conditions")}</small><b>{form.conditions.length ? (form.conditions.length === 1 ? t("شرط واحد", "1 condition") : t(`${form.conditions.length} شروط`, `${form.conditions.length} conditions`)) : t("كل الحالات", "All cases")}</b></article>
                      <span>←</span>
                      <article><small>{t("الإجراءات", "Actions")}</small><b>{form.actions.length === 1 ? t("إجراء واحد", "1 action") : t(`${form.actions.length} إجراءات`, `${form.actions.length} actions`)}</b></article>
                    </div>
                    <ul>{form.actions.map((action, index) => <li key={`${action.type}-${index}`}><span>{index + 1}</span>{staticLabel(action.type, t)}{action.target !== "لا يحتاج اختيار" ? ` — ${staticLabel(action.target, t)}` : ""}</li>)}</ul>
                  </div>
                  <label className="automation-enable-card">
                    <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} />
                    <span><b>{t("تشغيل القاعدة بعد الحفظ", "Enable after saving")}</b><small>{t("يمكنك إيقافها لاحقًا من صفحة القواعد.", "You can pause it later from the rules list.")}</small></span>
                  </label>
                </div>
              ) : null}
            </div>
            <footer className="modal-foot automation-wizard-foot">
              <div>{builderStep > 1 ? <button className="btn soft" type="button" onClick={() => { setFeedback(null); setBuilderStep((current) => current - 1); }}>{t("السابق", "Back")}</button> : <button className="btn soft" type="button" onClick={() => setFormOpen(false)}>{t("إلغاء", "Cancel")}</button>}</div>
              <span>{t(`الخطوة ${builderStep} من 4`, `Step ${builderStep} of 4`)}</span>
              <button className="btn primary" type="submit" disabled={saving}>{saving ? t("جاري الحفظ", "Saving...") : builderStep < 4 ? t("التالي", "Next") : form.enabled ? t("حفظ وتشغيل", "Save and enable") : t("حفظ كمتوقفة", "Save as disabled")}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
