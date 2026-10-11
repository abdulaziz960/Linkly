"use client";

import { useMemo, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import type { AutomationRule, Conversation, MessageTemplate, PipelineStage } from "../types";
import { pipelineStages, pipelineStagesWithDealValue } from "../types";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";

type PipelineViewProps = {
  conversations: Conversation[];
  automationRules: AutomationRule[];
  templates: MessageTemplate[];
  onOpenConversation: (id: string) => void;
  onRefreshData: () => Promise<void>;
};

type PipelineTab = "external" | "internal";

function stageLabel(stage: PipelineStage, t: (ar: string, en: string) => string) {
  const labels: Record<PipelineStage, [string, string]> = {
    "جديد": ["استفسار جديد", "New inquiry"],
    "مهتم": ["مهتم بالمشروع", "Interested in project"],
    "مؤهل": ["مؤهل للشراء", "Qualified buyer"],
    "عرض سعر": ["عرض سعر / تمويل", "Offer / financing"],
    "تم الحجز": ["حجز وحدة", "Unit reserved"],
    "فاز": ["تم البيع", "Sold"],
    "خسر": ["غير مهتم", "Not interested"]
  };
  const [ar, en] = labels[stage];
  return t(ar, en);
}

function CardBody({
  conversation,
  t,
  savingDealValue,
  onSetDealValue,
  templates,
  automationRules,
  templateMenuOpen,
  automationMenuOpen,
  onToggleTemplateMenu,
  onToggleAutomationMenu,
  onSendTemplate,
  onRunAutomation,
  onOpenConversation,
  onMove,
  feedback
}: {
  conversation: Conversation;
  t: (ar: string, en: string) => string;
  savingDealValue: boolean;
  onSetDealValue?: (id: string, value: number) => void;
  templates: MessageTemplate[];
  automationRules: AutomationRule[];
  templateMenuOpen?: boolean;
  automationMenuOpen?: boolean;
  onToggleTemplateMenu?: (id: string) => void;
  onToggleAutomationMenu?: (id: string) => void;
  onSendTemplate?: (id: string, templateName: string) => void;
  onRunAutomation?: (id: string, ruleId: string) => void;
  onOpenConversation?: (id: string) => void;
  onMove?: (id: string, stage: PipelineStage) => void;
  feedback?: string;
}) {
  const showDealValue = pipelineStagesWithDealValue.includes((conversation.pipelineStage ?? "جديد") as PipelineStage);
  const [dealInput, setDealInput] = useState(String(conversation.dealValue ?? 0));

  return (
    <div className="pipeline-card" data-conversation-id={conversation.id}>
      <div className="pipeline-card-top">
        <b>{conversation.customer}</b>
        <span className="pipeline-card-channel">{conversation.channel}</span>
      </div>
      <p className="pipeline-card-last">{conversation.lastMessage || t("لا رسائل بعد", "No messages yet")}</p>
      <div className="pipeline-card-meta">
        <span>{conversation.assignee}</span>
        <span>{conversation.attrUtmSource || t("مباشر", "Direct")}</span>
      </div>
      {onMove ? <div className="pipeline-card-meta pipeline-card-stage" onPointerDown={(event) => event.stopPropagation()}>
        <span>{t("المرحلة", "Stage")}</span>
        <CustomSelect
          className="pipeline-stage-select"
          ariaLabel={t("مرحلة الليد", "Lead stage")}
          value={conversation.pipelineStage || "جديد"}
          onChange={(value) => onMove(conversation.id, value as PipelineStage)}
          options={pipelineStages.map((stage) => ({ value: stage, label: stageLabel(stage, t) }))}
        />
      </div> : null}
      {conversation.tags?.length ? (
        <div className="pipeline-card-tags">
          {conversation.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      ) : null}
      {showDealValue ? (
        <div className="pipeline-card-deal">
          <span>{t("قيمة الوحدة", "Unit value")}</span>
          <input
            type="number"
            aria-label={t("قيمة الوحدة", "Unit value")}
            onPointerDown={(event) => event.stopPropagation()}
            min={0}
            value={dealInput}
            onChange={(event) => setDealInput(event.target.value)}
            onBlur={() => {
              const value = Math.max(0, Number(dealInput) || 0);
              if (value !== (conversation.dealValue ?? 0)) onSetDealValue?.(conversation.id, value);
            }}
            disabled={savingDealValue}
          />
          <small>{t("ر.س", "SAR")}</small>
        </div>
      ) : null}
      {onOpenConversation || onSendTemplate || onRunAutomation ? (
        <div className="pipeline-card-actions">
          {onOpenConversation ? <button type="button" onClick={() => onOpenConversation(conversation.id)}>{t("معاينة", "Preview")}</button> : null}
          {onSendTemplate ? (
            <div className="pipeline-card-menu-wrap">
              <button type="button" onClick={() => onToggleTemplateMenu?.(conversation.id)}>{t("إرسال قالب", "Send template")}</button>
              {templateMenuOpen ? (
                <div className="pipeline-card-menu">
                  {templates.length === 0 ? <p>{t("لا قوالب متاحة", "No templates available")}</p> : templates.map((template) => (
                    <button type="button" key={template.name} onClick={() => onSendTemplate(conversation.id, template.name)}>{template.name}</button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {onRunAutomation ? (
            <div className="pipeline-card-menu-wrap">
              <button type="button" onClick={() => onToggleAutomationMenu?.(conversation.id)}>{t("تشغيل أتمتة", "Run automation")}</button>
              {automationMenuOpen ? (
                <div className="pipeline-card-menu">
                  {automationRules.length === 0 ? <p>{t("لا قواعد متاحة", "No rules available")}</p> : automationRules.map((rule) => (
                    <button type="button" key={rule.id} onClick={() => onRunAutomation(conversation.id, rule.id)}>{rule.name}</button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {feedback ? <small className="pipeline-card-feedback" role="status">{feedback}</small> : null}
    </div>
  );
}

function DraggableCard(props: Parameters<typeof CardBody>[0]) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.conversation.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={`pipeline-card-drag ${isDragging ? "dragging" : ""}`}>
      <CardBody {...props} />
    </div>
  );
}

function Column({ stage, children, t, count }: { stage: PipelineStage; children: React.ReactNode; t: (ar: string, en: string) => string; count: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div ref={setNodeRef} className={`pipeline-column ${isOver ? "over" : ""}`}>
      <div className="pipeline-column-head">
        <b>{stageLabel(stage, t)}</b>
        <span>{count}</span>
      </div>
      <div className="pipeline-column-body">{children}</div>
    </div>
  );
}

function CopyField({ label, value, t }: { label: string; value: string; t: (ar: string, en: string) => string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard?.writeText(value).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="lead-copy-field">
      <span>{label}</span>
      <div>
        <code dir="ltr">{value}</code>
        <button type="button" onClick={copy}>{copied ? t("تم النسخ", "Copied") : t("نسخ", "Copy")}</button>
      </div>
    </div>
  );
}

function ExternalLeadsTab({ t }: { t: (ar: string, en: string) => string }) {
  const origin = typeof window === "undefined" ? "https://linklysa.io" : window.location.origin;
  const webhookUrl = `${origin}/api/v1/conversations`;
  const sampleBody = `{
  "customerName": "محمد عبدالله",
  "customerPhone": "0501234567",
  "text": "عميل محتمل من نموذج خارجي - مهتم بمشروع واجهة الرياض"
}`;

  return (
    <div className="lead-integration">
      <section className="lead-integration-hero">
        <div>
          <h3>{t("ربط منصة خارجية عبر Zapier", "Connect an external platform via Zapier")}</h3>
          <p>{t("استخدم Webhook من Zapier أو Make أو أي منصة نماذج لإرسال العميل المحتمل إلى لنكلي تلقائيًا وفتحه كمحادثة داخل المنصة.", "Use a webhook from Zapier, Make, or any form platform to send a lead to Linkly automatically and open it as a conversation inside the platform.")}</p>
        </div>
        <a className="lead-integration-link" href="/dashboard?view=developers">{t("مفاتيح API", "API keys")}</a>
      </section>

      <div className="lead-integration-grid">
        <section className="lead-integration-card">
          <h4>{t("إعداد Zapier", "Zapier setup")}</h4>
          <ol>
            <li>{t("اختر التطبيق الخارجي كمصدر الليد مثل Facebook Lead Ads أو Typeform أو Google Sheets.", "Choose the external app as the lead source, such as Facebook Lead Ads, Typeform, or Google Sheets.")}</li>
            <li>{t("أضف خطوة Webhooks by Zapier واختر Custom Request.", "Add a Webhooks by Zapier step and choose Custom Request.")}</li>
            <li>{t("طريقة الطلب POST، ونوع البيانات JSON.", "Use POST as the method and JSON as the data type.")}</li>
            <li>{t("أضف ترويسة Authorization بقيمة Bearer ثم مفتاح API الخاص بحساب العميل.", "Add the Authorization header with Bearer followed by the client's API key.")}</li>
          </ol>
        </section>

        <section className="lead-integration-card">
          <h4>{t("المتطلبات", "Requirements")}</h4>
          <ul>
            <li>{t("مفتاح API من صفحة المطورون أو من فريق لنكلي.", "An API key from the Developers page or the Linkly team.")}</li>
            <li>{t("رقم جوال سعودي للعميل المحتمل.", "A Saudi mobile number for the lead.")}</li>
            <li>{t("نص يوضح مصدر الليد أو المشروع المطلوب.", "A message describing the lead source or requested project.")}</li>
          </ul>
        </section>
      </div>

      <section className="lead-integration-card">
        <h4>{t("بيانات الويب هوك", "Webhook details")}</h4>
        <CopyField label={t("رابط الويب هوك", "Webhook URL")} value={webhookUrl} t={t} />
        <CopyField label={t("الترويسة", "Header")} value="Authorization: Bearer lk_xxxxxxxxxxxxxxxxxxxxxxxx" t={t} />
        <CopyField label={t("مثال JSON", "JSON example")} value={sampleBody} t={t} />
      </section>

      <section className="lead-integration-card">
        <h4>{t("الحقول", "Fields")}</h4>
        <div className="lead-fields-table">
          <div><b>customerPhone</b><span>{t("مطلوب - رقم جوال سعودي مثل 0501234567", "Required - Saudi mobile number such as 0501234567")}</span></div>
          <div><b>text</b><span>{t("مطلوب - نص الليد أو رسالة المصدر", "Required - lead message or source text")}</span></div>
          <div><b>customerName</b><span>{t("اختياري - اسم العميل المحتمل", "Optional - lead name")}</span></div>
          <div><b>visit</b><span>{t("اختياري - true إذا كان الليد يمثل زيارة أو حجزًا مؤكدًا", "Optional - true if the lead represents a visit or confirmed booking")}</span></div>
          <div><b>visitAt</b><span>{t("اختياري - وقت الزيارة بصيغة ISO", "Optional - visit time in ISO format")}</span></div>
        </div>
      </section>
    </div>
  );
}

function InternalLeadsTable({
  conversations,
  t,
  savingValueId,
  onMove,
  onSetDealValue,
  onOpenConversation
}: {
  conversations: Conversation[];
  t: (ar: string, en: string) => string;
  savingValueId: string | null;
  onMove: (id: string, stage: PipelineStage) => void;
  onSetDealValue: (id: string, value: number) => void;
  onOpenConversation: (id: string) => void;
}) {
  return (
    <section className="lead-table-panel">
      <div className="lead-table-head">
        <h3>{t("جدول الليد", "Lead table")}</h3>
        <span>{t(`${conversations.length} عميل محتمل`, `${conversations.length} leads`)}</span>
      </div>
      <div className="lead-table-wrap">
        <table className="lead-table">
          <thead>
            <tr>
              <th>{t("العميل", "Lead")}</th>
              <th>{t("المرحلة", "Stage")}</th>
              <th>{t("المصدر", "Source")}</th>
              <th>{t("الموظف", "Assignee")}</th>
              <th>{t("قيمة الوحدة", "Unit value")}</th>
              <th>{t("إجراء", "Action")}</th>
            </tr>
          </thead>
          <tbody>
            {conversations.map((conversation) => {
              const stage = (conversation.pipelineStage || "جديد") as PipelineStage;
              return (
                <tr key={conversation.id}>
                  <td data-label={t("العميل", "Lead")}><b>{conversation.customer}</b><small>{conversation.phone}</small></td>
                  <td data-label={t("المرحلة", "Stage")}>
                    <CustomSelect
                      className="lead-table-stage-select"
                      ariaLabel={t("مرحلة الليد", "Lead stage")}
                      value={stage}
                      onChange={(value) => onMove(conversation.id, value as PipelineStage)}
                      options={pipelineStages.map((item) => ({ value: item, label: stageLabel(item, t) }))}
                    />
                  </td>
                  <td data-label={t("المصدر", "Source")}>{conversation.attrUtmSource || conversation.channel || t("مباشر", "Direct")}</td>
                  <td data-label={t("الموظف", "Assignee")}>{conversation.assignee}</td>
                  <td data-label={t("قيمة الوحدة", "Unit value")}>
                    <input
                      type="number"
                      min={0}
                      defaultValue={conversation.dealValue ?? 0}
                      disabled={savingValueId === conversation.id}
                      onBlur={(event) => {
                        const value = Math.max(0, Number(event.currentTarget.value) || 0);
                        if (value !== (conversation.dealValue ?? 0)) onSetDealValue(conversation.id, value);
                      }}
                    />
                  </td>
                  <td data-label={t("إجراء", "Action")}><button type="button" onClick={() => onOpenConversation(conversation.id)}>{t("فتح", "Open")}</button></td>
                </tr>
              );
            })}
            {conversations.length === 0 ? (
              <tr><td colSpan={6}>{t("لا يوجد عملاء محتملون بعد.", "No leads yet.")}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function PipelineView({ conversations, automationRules, templates, onOpenConversation, onRefreshData }: PipelineViewProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<PipelineTab>("external");
  const [localStages, setLocalStages] = useState<Record<string, PipelineStage>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [savingValueId, setSavingValueId] = useState<string | null>(null);
  const [templateMenuId, setTemplateMenuId] = useState<string | null>(null);
  const [automationMenuId, setAutomationMenuId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function stageOf(conversation: Conversation): PipelineStage {
    return localStages[conversation.id] ?? (conversation.pipelineStage as PipelineStage) ?? "جديد";
  }

  const columns = useMemo(() => {
    const map = new Map<PipelineStage, Conversation[]>(pipelineStages.map((stage) => [stage, [] as Conversation[]]));
    for (const conversation of conversations) {
      map.get(stageOf(conversation))?.push(conversation);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, localStages]);

  async function moveConversation(id: string, stage: PipelineStage) {
    setLocalStages((current) => ({ ...current, [id]: stage }));
    const closing = stage === "فاز" || stage === "خسر";
    const response = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipelineStage: stage, ...(closing ? { status: "closed" } : {}) })
    }).catch(() => null);
    setFeedback((current) => ({ ...current, [id]: response?.ok ? t("تم حفظ المرحلة", "Stage saved") : t("تعذر حفظ المرحلة، حاول مجدداً", "Couldn't save stage; try again") }));
    await onRefreshData().catch(() => {});
    setLocalStages((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  async function setDealValue(id: string, value: number) {
    setSavingValueId(id);
    const response = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealValue: value })
    }).catch(() => null);
    setFeedback((current) => ({ ...current, [id]: response?.ok ? t("تم حفظ القيمة", "Value saved") : t("تعذر حفظ القيمة، حاول مجدداً", "Couldn't save value; try again") }));
    await onRefreshData().catch(() => {});
    setSavingValueId(null);
  }

  async function sendTemplate(id: string, templateName: string) {
    setTemplateMenuId(null);
    const response = await fetch(`/api/conversations/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "out", messageType: "template", templateName })
    }).catch(() => null);
    setFeedback((current) => ({ ...current, [id]: response?.ok ? t("تم إرسال القالب", "Template sent") : t("تعذر إرسال القالب", "Couldn't send template") }));
    await onRefreshData();
  }

  async function runAutomation(id: string, ruleId: string) {
    setAutomationMenuId(null);
    const response = await fetch(`/api/automations/${ruleId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: id })
    }).catch(() => null);
    setFeedback((current) => ({ ...current, [id]: response?.ok ? t("تم تشغيل الأتمتة", "Automation ran") : t("تعذر تشغيل الأتمتة", "Couldn't run automation") }));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const stage = over.id as PipelineStage;
    const conversation = conversations.find((item) => item.id === active.id);
    if (!conversation || stageOf(conversation) === stage) return;
    void moveConversation(conversation.id, stage);
  }

  const activeConversation = conversations.find((item) => item.id === activeId);

  return (
    <section className="pipeline-view">
      <div className="pipeline-head">
        <h2>{t("العملاء المحتملون", "Leads")}</h2>
        <p>{t("استقبل الليدات من منصة خارجية أو تابع العملاء المحتملين داخل لنكلي حسب المرحلة.", "Receive leads from an external platform or track leads inside Linkly by stage.")}</p>
        <div className="pipeline-tabs" role="tablist" aria-label={t("تبويبات العملاء المحتملين", "Leads tabs")}>
          <button type="button" role="tab" aria-selected={activeTab === "external"} onClick={() => setActiveTab("external")}>{t("ربط منصة خارجية", "External platform")}</button>
          <button type="button" role="tab" aria-selected={activeTab === "internal"} onClick={() => setActiveTab("internal")}>{t("داخل المنصة", "Inside platform")}</button>
        </div>
      </div>
      {activeTab === "external" ? <ExternalLeadsTab t={t} /> : (
        <div className="lead-internal">
          <InternalLeadsTable
            conversations={conversations}
            t={t}
            savingValueId={savingValueId}
            onMove={moveConversation}
            onSetDealValue={setDealValue}
            onOpenConversation={onOpenConversation}
          />
      <DndContext sensors={sensors} onDragStart={(event) => setActiveId(String(event.active.id))} onDragEnd={handleDragEnd}>
        <div className="pipeline-board">
          {pipelineStages.map((stage) => {
            const items = columns.get(stage) || [];
            return (
              <Column key={stage} stage={stage} t={t} count={items.length}>
                {items.map((conversation) => (
                  <DraggableCard
                    key={conversation.id}
                    conversation={conversation}
                    t={t}
                    savingDealValue={savingValueId === conversation.id}
                    onSetDealValue={setDealValue}
                    templates={templates}
                    automationRules={automationRules}
                    templateMenuOpen={templateMenuId === conversation.id}
                    automationMenuOpen={automationMenuId === conversation.id}
                    onToggleTemplateMenu={(id) => setTemplateMenuId((current) => (current === id ? null : id))}
                    onToggleAutomationMenu={(id) => setAutomationMenuId((current) => (current === id ? null : id))}
                    onSendTemplate={sendTemplate}
                    onRunAutomation={runAutomation}
                    onOpenConversation={onOpenConversation}
                    onMove={moveConversation}
                    feedback={feedback[conversation.id]}
                  />
                ))}
              </Column>
            );
          })}
        </div>
        <DragOverlay>
          {activeConversation ? (
            <CardBody
              conversation={activeConversation}
              t={t}
              savingDealValue={false}
              templates={templates}
              automationRules={automationRules}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
        </div>
      )}
    </section>
  );
}
