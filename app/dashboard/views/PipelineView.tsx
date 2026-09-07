"use client";

import { useMemo, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import type { AutomationRule, Conversation, MessageTemplate, PipelineStage } from "../types";
import { pipelineStages, pipelineStagesWithDealValue } from "../types";
import { useLanguage } from "../i18n";

type PipelineViewProps = {
  conversations: Conversation[];
  automationRules: AutomationRule[];
  templates: MessageTemplate[];
  onOpenConversation: (id: string) => void;
  onRefreshData: () => Promise<void>;
};

function stageLabel(stage: PipelineStage, t: (ar: string, en: string) => string) {
  const labels: Record<PipelineStage, [string, string]> = {
    "جديد": ["جديد", "New"],
    "مهتم": ["مهتم", "Interested"],
    "مؤهل": ["مؤهل", "Qualified"],
    "عرض سعر": ["عرض سعر", "Quoted"],
    "تم الحجز": ["تم الحجز", "Booked"],
    "فاز": ["فاز", "Won"],
    "خسر": ["خسر", "Lost"]
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
  feedback?: string;
}) {
  const showDealValue = pipelineStagesWithDealValue.includes((conversation.pipelineStage ?? "جديد") as PipelineStage);
  const [dealInput, setDealInput] = useState(String(conversation.dealValue ?? 0));

  return (
    <div className="pipeline-card">
      <div className="pipeline-card-top">
        <b>{conversation.customer}</b>
        <span className="pipeline-card-channel">{conversation.channel}</span>
      </div>
      <p className="pipeline-card-last">{conversation.lastMessage || t("لا رسائل بعد", "No messages yet")}</p>
      <div className="pipeline-card-meta">
        <span>{conversation.assignee}</span>
        <span>{conversation.attrUtmSource || t("مباشر", "Direct")}</span>
      </div>
      {conversation.tags?.length ? (
        <div className="pipeline-card-tags">
          {conversation.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      ) : null}
      {showDealValue ? (
        <div className="pipeline-card-deal">
          <span>{t("القيمة", "Value")}</span>
          <input
            type="number"
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
      {feedback ? <small className="pipeline-card-feedback">{feedback}</small> : null}
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

export default function PipelineView({ conversations, automationRules, templates, onOpenConversation, onRefreshData }: PipelineViewProps) {
  const { t } = useLanguage();
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
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipelineStage: stage, ...(closing ? { status: "closed" } : {}) })
    }).catch(() => {});
    await onRefreshData();
    setLocalStages((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  async function setDealValue(id: string, value: number) {
    setSavingValueId(id);
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealValue: value })
    }).catch(() => {});
    await onRefreshData();
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
        <h2>{t("كانبان المبيعات", "Sales Kanban")}</h2>
        <p>{t("اسحب المحادثة بين المراحل لمتابعة رحلة العميل من أول تواصل حتى الإغلاق.", "Drag a conversation between stages to track the customer's journey from first contact to close.")}</p>
      </div>
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
    </section>
  );
}
