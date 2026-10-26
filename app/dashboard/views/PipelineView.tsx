"use client";

import LeadFiltersBar from "../components/LeadFiltersBar";
import { EMPTY_LEAD_FILTERS, applyLeadFilters, buildFilterOptions, type LeadFilters } from "../lead-filters";
import { useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import type { AutomationRule, Conversation, MessageTemplate, PipelineStage } from "../types";
import { pipelineStages, pipelineStagesWithDealValue } from "../types";
import { PageHero } from "../components/PageHero";
import { useLanguage } from "../i18n";
import QuickWelcomeTemplate from "../components/QuickWelcomeTemplate";
import CustomSelect from "../../components/CustomSelect";

type PipelineViewProps = {
  conversations: Conversation[];
  automationRules: AutomationRule[];
  templates: MessageTemplate[];
  onOpenConversation: (id: string) => void;
  onRefreshData: () => Promise<void>;
};

type PipelineTab = "external" | "internal" | "links";

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

function CopyField({ label, value, t, multiline = false }: { label: string; value: string; t: (ar: string, en: string) => string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard?.writeText(value).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 800 }}>{label}</span>
      <div style={{ display: "flex", gap: 8, alignItems: multiline ? "flex-start" : "center" }}>
        <code dir="ltr" style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line, #dfe7e5)", background: "var(--surface-soft, #f3f7f6)", fontSize: 13, textAlign: "left", whiteSpace: multiline ? "pre" : "nowrap", overflowX: "auto" }}>{value}</code>
        <button type="button" className="soft-action" style={{ flexShrink: 0, minHeight: 38, padding: "0 14px" }} onClick={copy}>{copied ? t("تم النسخ ✓", "Copied ✓") : t("نسخ", "Copy")}</button>
      </div>
    </div>
  );
}

/** One row of Zapier's configuration screen: the field's name there, and the value to put in it. */
function ZapRow({ field, value, hint, t, copyable = true, data = false }: { field: string; value?: string; hint?: string; t: (ar: string, en: string) => string; copyable?: boolean; data?: boolean }) {
  const [copied, setCopied] = useState(false);
  const toCopy = data ? field : value || "";
  async function copy() {
    await navigator.clipboard?.writeText(toCopy).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }
  const copyButton = copyable ? (
    <button type="button" className="soft-action" style={{ flexShrink: 0, minHeight: 30, padding: "0 10px", fontSize: 12.5 }} onClick={copy}>{copied ? "✓" : t("نسخ", "Copy")}</button>
  ) : null;
  return (
    <div className="zap-cols" style={{ display: "grid", gridTemplateColumns: "minmax(170px, 0.8fr) minmax(0, 1.7fr)", gap: 16, alignItems: "center", padding: "12px 14px", borderTop: "1px solid var(--line, #e6eeec)" }}>
      {data ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
          <code dir="ltr" style={{ flex: 1, minWidth: 0, textAlign: "left", fontSize: 13, fontWeight: 800, padding: "6px 10px", borderRadius: 8, background: "var(--surface-soft, #f3f7f6)", border: "1px solid var(--line, #dfe7e5)", overflowX: "auto", whiteSpace: "nowrap" }}>{field}</code>
          {copyButton}
        </div>
      ) : (
        <b style={{ textAlign: "start", fontSize: 13.5 }}>{field}</b>
      )}
      <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
        {!data ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
            <code dir="ltr" style={{ flex: 1, minWidth: 0, textAlign: "left", fontSize: 13, padding: "6px 10px", borderRadius: 8, background: "var(--surface-soft, #f3f7f6)", border: "1px solid var(--line, #dfe7e5)", overflowX: "auto", whiteSpace: "nowrap" }}>{value}</code>
            {copyButton}
          </div>
        ) : null}
        {hint ? <span dir={t("rtl", "ltr")} style={{ display: "block", fontSize: 13.5, opacity: data ? 1 : 0.8, lineHeight: 1.7, textAlign: "start" }}>{hint}</span> : null}
      </div>
    </div>
  );
}

/** A bordered group of Zapier rows with a titled header and a column-header strip. */
function ZapGroup({ title, columns, children }: { title: string; columns: [string, string]; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 12, border: "1px solid var(--line, #dfe7e5)", background: "var(--surface, #fff)", overflow: "hidden" }}>
      <div style={{ padding: "11px 14px", background: "#e8f3f1", fontWeight: 900, fontSize: 14, borderInlineStart: "4px solid #178a82" }}>{title}</div>
      <div className="zap-cols zap-head" style={{ display: "grid", gridTemplateColumns: "minmax(170px, 0.8fr) minmax(0, 1.7fr)", gap: 16, padding: "7px 14px", fontSize: 12, fontWeight: 800, opacity: 0.65, background: "var(--surface-soft, #f6faf9)" }}>
        <span>{columns[0]}</span>
        <span>{columns[1]}</span>
      </div>
      {children}
    </div>
  );
}

function StepCard({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "grid", gridTemplateColumns: "40px minmax(0, 1fr)", gap: 14, padding: 16, borderRadius: 14, border: "1px solid var(--line, #dfe7e5)", background: "var(--surface, #fff)" }}>
      <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 999, display: "grid", placeItems: "center", background: "#178a82", color: "#fff", fontWeight: 900 }}>{number}</span>
      <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
        <h4 style={{ margin: 0, fontSize: 15.5, fontWeight: 900 }}>{title}</h4>
        {children}
      </div>
    </section>
  );
}

type WaLinkItem = { code: string; name: string; platform: string; campaign: string; message: string; createdAt: string; clicks: number; conversations: number };

/** WhatsApp tracking links for ads: the destination to use in Snapchat / TikTok / Google ads. */
function WaLinksTab({ t }: { t: (ar: string, en: string) => string }) {
  const [links, setLinks] = useState<WaLinkItem[]>([]);
  const [origin, setOrigin] = useState("");
  const [whatsappReady, setWhatsappReady] = useState(true);
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("snapchat");
  const [campaign, setCampaign] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const response = await fetch("/api/wa-links", { cache: "no-store" });
      const result = await response.json().catch(() => null) as { ok?: boolean; data?: { links: WaLinkItem[]; origin: string; whatsappReady: boolean } } | null;
      if (response.ok && result?.ok && result.data) {
        setLinks(result.data.links);
        setOrigin(result.data.origin);
        setWhatsappReady(result.data.whatsappReady);
      }
    } catch {
      // The list simply stays empty.
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/wa-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, platform, campaign, message }) });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) {
        setError(result?.error || t("تعذر إنشاء الرابط", "Could not create the link"));
        return;
      }
      setName("");
      setCampaign("");
      setMessage("");
      await load();
    } catch {
      setError(t("تعذر الاتصال بالخادم", "Could not reach the server"));
    } finally {
      setBusy(false);
    }
  }

  async function copy(code: string) {
    await navigator.clipboard?.writeText(`${origin}/api/w/${code}`).catch(() => undefined);
    setCopied(code);
    window.setTimeout(() => setCopied(""), 1500);
  }

  const platformLabel = (value: string) => ({ snapchat: t("سناب شات", "Snapchat"), tiktok: t("تيك توك", "TikTok"), google: t("قوقل", "Google"), meta: t("ميتا", "Meta"), other: t("أخرى", "Other") }[value] ?? value);
  const muted: React.CSSProperties = { margin: 0, lineHeight: 1.8, opacity: 0.8, fontSize: 14 };
  const input: React.CSSProperties = { width: "100%", minHeight: 42, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line, #cfd9d6)", background: "var(--surface, #fff)", color: "inherit", font: "inherit", fontWeight: 600 };
  const label: React.CSSProperties = { display: "grid", gap: 6, fontWeight: 700, fontSize: 14 };

  return (
    <div style={{ display: "grid", gap: 14, minHeight: 0, overflow: "auto", paddingBottom: 24 }}>
      <section style={{ display: "grid", gap: 10, padding: 18, borderRadius: 14, border: "1px solid var(--line, #dfe7e5)", background: "var(--surface-soft, rgba(23,138,130,0.06))" }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{t("روابط واتساب لإعلاناتك", "WhatsApp links for your ads")}</h3>
        <p style={muted}>{t("استخدم الرابط وجهةً لإعلان سناب أو تيك توك أو قوقل بدل رابط واتساب المباشر. عند الضغط يسجّل لنكلي النقرة ومعرّفها ثم يفتح واتساب برسالتك الجاهزة، فيظهر مصدر العميل (المنصة والحملة) أعلى المحادثة، وتُطابَق أحداث المراحل بمعرّف النقرة.", "Use the link as the destination of a Snapchat, TikTok or Google ad instead of a plain WhatsApp link. On click Linkly records the click and its id, then opens WhatsApp with your message, so the customer's source (platform and campaign) shows above the conversation and stage events are matched with the click id.")}</p>
        {!whatsappReady ? <p className="meta-test-warning" style={{ margin: 0 }}>{t("واتساب غير مربوط بعد، فلن تعمل الروابط حتى تربطه.", "WhatsApp is not connected yet, so the links will not work until you connect it.")}</p> : null}
      </section>

      <section style={{ display: "grid", gap: 12, padding: 16, borderRadius: 14, border: "1px solid var(--line, #dfe7e5)", background: "var(--surface, #fff)" }}>
        <h4 style={{ margin: 0, fontSize: 15.5, fontWeight: 900 }}>{t("إنشاء رابط جديد", "Create a link")}</h4>
        <label style={label}>
          {t("اسم الرابط", "Link name")}
          <input style={input} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("مثال: إعلان سناب - عرض الصيف", "e.g. Snapchat ad - summer offer")} />
        </label>
        <label style={label}>
          {t("المنصة", "Platform")}
          <CustomSelect value={platform} onChange={setPlatform} options={[
            { value: "snapchat", label: t("سناب شات", "Snapchat") },
            { value: "tiktok", label: t("تيك توك", "TikTok") },
            { value: "google", label: t("قوقل", "Google") },
            { value: "meta", label: t("ميتا", "Meta") },
            { value: "other", label: t("أخرى", "Other") }
          ]} />
        </label>
        <label style={label}>
          {t("اسم الحملة أو المشروع (اختياري)", "Campaign or project name (optional)")}
          <input style={input} value={campaign} onChange={(event) => setCampaign(event.target.value)} placeholder={t("مثال: مشروع واجهة الرياض", "e.g. Riyadh Front project")} />
        </label>
        <label style={label}>
          {t("الرسالة الجاهزة في واتساب", "Pre-filled WhatsApp message")}
          <input style={input} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t("السلام عليكم، أبغى أستفسر عن العرض", "Hello, I'd like to ask about the offer")} />
        </label>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="primary-action" type="button" disabled={busy} onClick={() => void create()}>{t("إنشاء الرابط", "Create link")}</button>
          {error ? <span className="meta-test-feedback error">{error}</span> : null}
        </div>
      </section>

      <section style={{ display: "grid", gap: 10, padding: 16, borderRadius: 14, border: "1px solid var(--line, #dfe7e5)", background: "var(--surface, #fff)" }}>
        <h4 style={{ margin: 0, fontSize: 15.5, fontWeight: 900 }}>{t("روابطك", "Your links")}</h4>
        {links.length === 0 ? <p style={muted}>{t("لا توجد روابط بعد.", "No links yet.")}</p> : null}
        {links.map((link) => (
          <div key={link.code} style={{ display: "grid", gap: 8, padding: "12px 14px", borderRadius: 10, background: "var(--surface-soft, #f3f7f6)" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <b>{link.name}</b>
              <span style={{ padding: "1px 10px", borderRadius: 999, background: "#178a82", color: "#fff", fontSize: 12, fontWeight: 800 }}>{platformLabel(link.platform)}</span>
              {link.campaign ? <span style={{ opacity: 0.75, fontSize: 13 }}>{link.campaign}</span> : null}
              <span style={{ marginInlineStart: "auto", fontSize: 13, opacity: 0.8 }}>{t(`${link.clicks} نقرة · ${link.conversations} محادثة`, `${link.clicks} clicks · ${link.conversations} chats`)}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <code dir="ltr" style={{ flex: 1, minWidth: 0, textAlign: "left", fontSize: 13, padding: "6px 10px", borderRadius: 8, background: "var(--surface, #fff)", border: "1px solid var(--line, #dfe7e5)", overflowX: "auto", whiteSpace: "nowrap" }}>{`${origin}/api/w/${link.code}`}</code>
              <button type="button" className="soft-action" style={{ flexShrink: 0, minHeight: 34 }} onClick={() => void copy(link.code)}>{copied === link.code ? "✓" : t("نسخ", "Copy")}</button>
            </div>
          </div>
        ))}
        <p style={{ ...muted, fontSize: 12.5 }}>{t("ضع الرابط كما هو في «الوجهة / Website URL» في الإعلان. سناب يضيف معرّف النقرة (ScCid) وتيك توك ttclid وقوقل gclid تلقائيًا، وتبقى كل المعرّفات تُلتقط.", "Put the link as is in the ad's destination / Website URL. Snapchat adds ScCid, TikTok ttclid and Google gclid automatically, and every id is captured.")}</p>
      </section>
    </div>
  );
}

/** The WhatsApp welcome for leads that arrive through Zapier / Make / the API (TikTok, Google, forms...). */
function ExternalWelcomeCard({ t }: { t: (ar: string, en: string) => string }) {
  const [enabled, setEnabled] = useState(false);
  const [template, setTemplate] = useState("");
  const [templates, setTemplates] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function loadTemplates() {
    fetch("/api/templates")
      .then((response) => response.json())
      .then((result: { ok: boolean; data?: Array<{ name: string; status?: string }> }) => {
        if (!result?.ok) return;
        setTemplates((result.data || []).filter((item) => item.status === "معتمد").map((item) => item.name));
      })
      .catch(() => null);
  }
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/leads/welcome", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { ok?: boolean; data?: { settings: { enabled: boolean; template: string } } }) => {
        if (cancelled || !result?.ok || !result.data) return;
        setEnabled(result.data.settings.enabled);
        setTemplate(result.data.settings.template);
      })
      .catch(() => null);
    fetch("/api/templates")
      .then((response) => response.json())
      .then((result: { ok: boolean; data?: Array<{ name: string; status?: string }> }) => {
        if (cancelled || !result?.ok) return;
        setTemplates((result.data || []).filter((item) => item.status === "معتمد").map((item) => item.name));
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/leads/welcome", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, template }) });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; data?: { settings: { enabled: boolean; template: string } } } | null;
      if (response.ok && result?.ok && result.data) {
        setEnabled(result.data.settings.enabled);
        setTemplate(result.data.settings.template);
        const downgraded = enabled && !result.data.settings.enabled;
        setFeedback({ ok: !downgraded, text: downgraded ? t("حُفظت الإعدادات لكن لم يُفعَّل الترحيب: اختر قالبًا أولًا.", "Saved, but the welcome is off: choose a template first.") : t("تم الحفظ", "Saved") });
      } else {
        setFeedback({ ok: false, text: result?.error || t("تعذر الحفظ", "Could not save") });
      }
    } catch {
      setFeedback({ ok: false, text: t("تعذر الاتصال بالخادم", "Could not reach the server") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 12, padding: 16, borderRadius: 14, border: "1px solid var(--line, #dfe7e5)", background: "var(--surface, #fff)" }}>
      <h4 style={{ margin: 0, fontSize: 15.5, fontWeight: 900 }}>{t("رسالة ترحيب تلقائية على واتساب", "Automatic WhatsApp welcome")}</h4>
      <p style={{ margin: 0, lineHeight: 1.8, opacity: 0.8, fontSize: 14 }}>
        {t("تُرسل لكل ليد جديد يصل من هنا (تيك توك، قوقل، وغيرها) فور وصوله، مرة واحدة لكل رقم. تحتاج قالبًا معتمدًا وواتساب مربوطًا. تُحفظ معلومات النموذج في محادثته فيكمل الرد الآلي أو الموظف من حيث وصل.", "Sent to every new lead that arrives here (TikTok, Google, others) as soon as it arrives, once per number. Needs an approved template and a connected WhatsApp. The form details are saved in its conversation so the auto-reply or an agent continues from there.")}
      </p>
      <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, cursor: "pointer" }}>
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} style={{ width: 18, height: 18 }} />
        {t("تفعيل رسالة الترحيب", "Turn the welcome on")}
      </label>
      <div style={{ maxWidth: 360 }}>
        {templates.length ? (
          <CustomSelect value={template} onChange={setTemplate} placeholder={t("اختر قالبًا", "Choose a template")} options={[{ value: "", label: t("اختر قالبًا", "Choose a template") }, ...templates.map((name) => ({ value: name, label: name }))]} />
        ) : (
          <p className="meta-test-warning" style={{ margin: 0 }}>{t("ما فيه قوالب معتمدة على حسابك بعد.", "Your account has no approved templates yet.")}</p>
        )}
      </div>
      <QuickWelcomeTemplate onCreated={loadTemplates} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="primary-action" type="button" disabled={busy} onClick={() => void save()}>{t("حفظ", "Save")}</button>
        {feedback ? <span className={`meta-test-feedback ${feedback.ok ? "success" : "error"}`}>{feedback.text}</span> : null}
      </div>
    </section>
  );
}

function ExternalLeadsTab({ t, onShowInternal, onRefresh }: { t: (ar: string, en: string) => string; onShowInternal: () => void; onRefresh: () => Promise<void> }) {
  const [source, setSource] = useState<"tiktok" | "google" | "other">("tiktok");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function sendTestLead() {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch("/api/leads/test", { method: "POST" });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (response.ok && result?.ok) {
        await onRefresh().catch(() => undefined);
        setTestResult({ ok: true, text: t("وصل الليد التجريبي ✓ يظهر الآن في «داخل المنصة» بمرحلة «استفسار جديد».", "The test lead arrived ✓ It now shows under “Inside platform” at “New inquiry”.") });
      } else {
        setTestResult({ ok: false, text: result?.error || t("تعذر إنشاء الليد التجريبي", "Could not create the test lead") });
      }
    } catch {
      setTestResult({ ok: false, text: t("تعذر الاتصال بالخادم", "Could not reach the server") });
    } finally {
      setTesting(false);
    }
  }

  const origin = typeof window === "undefined" ? "https://linklysa.io" : window.location.origin;
  const webhookUrl = `${origin}/api/v1/conversations`;
  const sampleBody = `{
  "full_name": "محمد عبدالله",
  "phone_number": "0501234567",
  "email": "mohammed@example.com",
  "budget": "1,200,000",
  "purchase_purpose": "سكن",
  "purchase_method": "تمويل بنكي",
  "preferred_contact_time": "بعد العصر"
}`;
  const muted: React.CSSProperties = { margin: 0, lineHeight: 1.8, opacity: 0.8, fontSize: 14 };

  const fields: Array<{ name: string; label: string; required: boolean; description: string; example: string }> = [
    { name: "phone_number", label: t("رقم الجوال", "Mobile number"), required: true, description: t("جوال العميل. به نفتح محادثته ونتواصل معه.", "The customer's mobile. We open their conversation with it."), example: "0501234567" },
    { name: "full_name", label: t("الاسم", "Name"), required: false, description: t("اسم العميل. إن لم تُرسله نعرض رقم جواله.", "The customer's name. If omitted we show the phone number."), example: t("محمد عبدالله", "Mohammed") },
    { name: "email", label: t("البريد الإلكتروني", "Email"), required: false, description: t("بريد العميل، يُحفظ مع بيانات النموذج.", "The customer's email, kept with the form data."), example: "mohammed@example.com" },
    { name: "budget", label: t("الميزانية", "Budget"), required: false, description: t("ميزانية العميل كما كتبها.", "The customer's budget as typed."), example: "1,200,000" },
    { name: "purchase_purpose", label: t("الغرض من الشراء", "Purchase purpose"), required: false, description: t("سكن، استثمار...", "Living, investment..."), example: t("سكن", "Living") },
    { name: "purchase_method", label: t("طريقة الشراء", "Purchase method"), required: false, description: t("نقدًا، تمويل بنكي...", "Cash, bank financing..."), example: t("تمويل بنكي", "Bank financing") },
    { name: "preferred_contact_time", label: t("وقت التواصل المفضل", "Preferred contact time"), required: false, description: t("متى يفضّل العميل أن يُتصل به.", "When the customer prefers to be contacted."), example: t("بعد العصر", "Afternoon") }
  ];

  return (
    <div style={{ display: "grid", gap: 14, minHeight: 0, overflow: "auto", paddingBottom: 24 }}>
      <section style={{ display: "grid", gap: 10, padding: 18, borderRadius: 14, border: "1px solid var(--line, #dfe7e5)", background: "var(--surface-soft, rgba(23,138,130,0.06))" }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{t("ربط منصة نماذج خارجية (Zapier أو Make)", "Connect an external form platform (Zapier or Make)")}</h3>
        <p style={muted}>{t("لأي منصة ليس لها ربط مباشر مثل نماذج تيك توك أو نماذج قوقل أو Typeform أو Google Sheets: ترسل ليدها إلى لنكلي فيظهر هنا كمحادثة ومرحلة «استفسار جديد».", "For any platform without a direct connection, such as TikTok forms, Google forms, Typeform or Google Sheets: send its leads to Linkly and they show up here as a conversation at the “New inquiry” stage.")}</p>
        <p style={{ ...muted, opacity: 0.9 }}>
          {t("ميتا وسناب شات لا يحتاجان هذا: يرتبطان مباشرة من صفحة", "Meta and Snapchat do not need this: they connect directly from the")} <a href="/dashboard?view=integrations" style={{ fontWeight: 800 }}>{t("التكاملات", "Integrations")}</a>.
        </p>
      </section>

      <StepCard number={1} title={t("احصل على مفتاح API", "Get an API key")}>
        <p style={muted}>{t("من صفحة «المطورون» أنشئ مفتاحًا. يبدأ بـ lk_ ويظهر مرة واحدة، فانسخه واحفظه.", "Create a key on the Developers page. It starts with lk_ and is shown once, so copy and keep it.")}</p>
        <a className="btn primary" href="/dashboard?view=developers" style={{ justifySelf: "start" }}>{t("فتح صفحة المطورون", "Open the Developers page")}</a>
      </StepCard>

      <StepCard number={2} title={t("اختر مصدر الليد (المشغّل) في Zapier أو Make", "Pick the lead source (trigger) in Zapier or Make")}>
        <p style={muted}>{t("المشغّل هو المنصة التي يملأ فيها العميل النموذج. هذا التبويب للمنصات التي ليس لها ربط مباشر في لنكلي (تيك توك وقوقل وغيرهما). ميتا وسناب شات يرتبطان مباشرة من التكاملات بدون Zapier. اختر مصدرك لتظهر لك أسماء الحقول:", "The trigger is the platform where the customer fills the form. This tab is for platforms without a direct connection in Linkly (TikTok, Google and others). Meta and Snapchat connect directly from Integrations, no Zapier. Pick yours to see the field names:")}</p>
        <div style={{ maxWidth: 320 }}>
          <CustomSelect value={source} onChange={(value) => setSource(value as "tiktok" | "google" | "other")} options={[
            { value: "tiktok", label: t("تيك توك: TikTok Lead Generation ← New Lead", "TikTok: TikTok Lead Generation → New Lead") },
            { value: "google", label: t("قوقل: Google Ads ← New Lead Form Response", "Google: Google Ads → New Lead Form Response") },
            { value: "other", label: t("مصدر آخر: Typeform / Google Sheets / غيره", "Other: Typeform / Google Sheets / other") }
          ]} />
        </div>
      </StepCard>

      <StepCard number={3} title={t("أضف إجراء Webhook POST واملأه كما يلي", "Add a Webhook POST action and fill it in like this")}>
        <p style={muted}>{t("إجراء (Action) جديد: Webhooks by Zapier ← حدث POST. هذا ما ستملؤه في كل قسم من الشاشة، بالترتيب نفسه:", "A new Action: Webhooks by Zapier → POST event. This is what to put in each section of the screen, in the same order:")}</p>

        <ZapGroup title={t("① الإعداد العام", "① General")} columns={[t("الحقل في Zapier", "Field in Zapier"), t("ما تضعه فيه", "What to put in it")]}>
        <ZapRow field="URL" value={webhookUrl} t={t} />
        <ZapRow field="Payload Type" value="Json" hint={t("أو Form، كلاهما مقبول.", "Or Form; both are accepted.")} t={t} />
        <ZapRow field="Wrap Request In Array" value="No" t={t} copyable={false} />
        <ZapRow field="Unflatten" value="Yes" t={t} copyable={false} />
        </ZapGroup>

        <ZapGroup title={t("② Data: أضف سطرًا لكل حقل", "② Data: add one row per field")} columns={[t("اسم الحقل (انسخه)", "Field name (copy it)"), t("ما تختاره في خانة القيمة", "What to pick in the value box")]}>
        <ZapRow data field="phone_number" hint={t(`${source === "other" ? "عمود/سؤال الجوال" : "1. Phone Number"} ← مطلوب`, `${source === "other" ? "the phone column/question" : "1. Phone Number"} → required`)} t={t} />
        <ZapRow data field="full_name" hint={t(`${source === "other" ? "عمود/سؤال الاسم" : "1. Full Name"}`, `${source === "other" ? "the name column/question" : "1. Full Name"}`)} t={t} />
        <ZapRow data field="email" hint={t(`${source === "other" ? "عمود/سؤال البريد" : "1. Email"}`, `${source === "other" ? "the email column/question" : "1. Email"}`)} t={t} />
        <ZapRow data field="budget" hint={t(source === "other" ? "إجابة سؤال الميزانية" : "1. اسم السؤال المخصص (مثل «الميزانية»)", source === "other" ? "The budget answer" : "1. your custom question (e.g. “Budget”)")} t={t} />
        <ZapRow data field="purchase_purpose" hint={t("إجابة سؤال الغرض من الشراء", "The purchase-purpose answer")} t={t} />
        <ZapRow data field="purchase_method" hint={t("إجابة سؤال طريقة الشراء", "The purchase-method answer")} t={t} />
        <ZapRow data field="preferred_contact_time" hint={t("إجابة وقت التواصل المفضل", "The preferred-contact-time answer")} t={t} />
        <ZapRow data field="lead_source" hint={t(`مهم: نص ثابت تكتبه (${source === "tiktok" ? "تيك توك" : source === "google" ? "قوقل" : "اسم مصدرك"}). به تظهر المنصة فوق المحادثة وفي فلتر «مصدر الإعلان». اكتب: تيك توك أو قوقل أو سناب أو ميتا.`, `Important: a fixed text you type (${source === "tiktok" ? "TikTok" : source === "google" ? "Google" : "your source name"}). It makes the platform show above the conversation and in the “Ad source” filter. Write: TikTok, Google, Snapchat or Meta.`)} t={t} />
        <ZapRow data field="campaign" hint={t("اختياري: اسم الحملة أو المشروع. يظهر في الشريط وفي فلتر «المشروع / الحملة».", "Optional: the campaign or project name. Shown in the strip and in the “Project / campaign” filter.")} t={t} />

        </ZapGroup>

        <ZapGroup title={t("③ Headers: سطر واحد", "③ Headers: one row")} columns={[t("الاسم", "Name"), t("القيمة", "Value")]}>
        <ZapRow field="Authorization" value="Bearer lk_xxxxxxxxxxxxxxxxxxxxxxxx" hint={t("استبدل lk_xxx بمفتاحك من الخطوة 1. اترك مسافة بعد كلمة Bearer.", "Replace lk_xxx with your key from step 1. Keep a space after the word Bearer.")} t={t} />
        </ZapGroup>

        <details style={{ marginTop: 4 }}>
          <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: 13.5 }}>{t("بديل: حدث Custom Request بجسم JSON كامل", "Alternative: the Custom Request event with a full JSON body")}</summary>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <p style={muted}>{t("Method: POST. في Data الصق هذا الجسم واستبدل القيم بحقول المصدر. وفي Headers ضع Authorization كما فوق، و Content-Type: application/json.", "Method: POST. Paste this body in Data and replace the values with the source fields. In Headers put Authorization as above, plus Content-Type: application/json.")}</p>
            <CopyField label={t("الجسم (JSON)", "Body (JSON)")} value={sampleBody} t={t} multiline />
          </div>
        </details>

        <p className="meta-test-feedback" style={{ margin: "6px 0 0", lineHeight: 1.8 }}>
          {t("عند الضغط على Test في Zapier، رقم الجوال التجريبي (555-123-4567) ليس سعوديًا فيرجع الخطأ 400. هذا طبيعي: ضع رقمًا سعوديًا مؤقتًا للاختبار فقط.", "When you click Test in Zapier, the sample phone (555-123-4567) is not Saudi, so you get a 400 error. That is normal: put a Saudi number temporarily just for the test.")}
        </p>
      </StepCard>

      <StepCard number={4} title={t("جرّب وتحقّق", "Test it")}>
        <p style={muted}>{t("شغّل الاختبار في Zapier أو Make بنموذج تجريبي، ثم افتح تبويب «داخل المنصة»: يظهر العميل بمرحلة «استفسار جديد» وتجد محادثته في صندوق الوارد.", "Run the test in Zapier or Make with a sample entry, then open the “Inside platform” tab: the lead appears at “New inquiry” and its conversation is in the inbox.")}</p>
        <p style={muted}>{t("أو تأكد من أن صفحة الليدات تستقبل بضغطة واحدة: يُنشأ عميل باسم «ليد تجريبي» (نفس العميل في كل مرة).", "Or check that the leads page receives leads in one click: a customer named “Test lead” is created (the same one each time).")}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn primary" type="button" disabled={testing} onClick={() => void sendTestLead()}>{testing ? t("جارٍ الإرسال…", "Sending…") : t("إرسال ليد تجريبي", "Send a test lead")}</button>
          {testResult?.ok ? <button className="soft-action" type="button" onClick={onShowInternal}>{t("عرضه في داخل المنصة", "Show it inside the platform")}</button> : null}
        </div>
        {testResult ? <p className={`meta-test-feedback ${testResult.ok ? "success" : "error"}`} style={{ margin: 0 }}>{testResult.text}</p> : null}
      </StepCard>

      <ExternalWelcomeCard t={t} />

      <section style={{ display: "grid", gap: 10, padding: 16, borderRadius: 14, border: "1px solid var(--line, #dfe7e5)", background: "var(--surface, #fff)" }}>
        <h4 style={{ margin: 0, fontSize: 15.5, fontWeight: 900 }}>{t("ما الذي ترسله مع كل عميل؟", "What do you send with each lead?")}</h4>
        <p style={muted}>{t("في الخطوة ③ (جسم JSON) تُرسل معلومات العميل بهذه الأسماء. رقم الجوال وحده مطلوب. وأي حقل آخر في نموذجك تُرسله يظهر تلقائيًا في محادثة العميل.", "In step ③ (the JSON body) you send the customer's details with these names. Only the mobile number is required. Any other field of your form that you send shows up automatically in the customer's conversation.")}</p>
        <div style={{ display: "grid", gap: 8 }}>
          {fields.map((field) => (
            <div key={field.name} style={{ display: "grid", gap: 6, padding: "12px 14px", borderRadius: 10, background: "var(--surface-soft, #f3f7f6)", borderInlineStart: `4px solid ${field.required ? "#e0752d" : "#9ccfca"}` }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <b style={{ fontSize: 14.5 }}>{field.label}</b>
                <code dir="ltr" style={{ padding: "1px 8px", borderRadius: 6, background: "var(--surface, #fff)", border: "1px solid var(--line, #dfe7e5)", fontSize: 12.5 }}>{field.name}</code>
                <span style={{ padding: "1px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800, background: field.required ? "#fde6d8" : "#e6eef0", color: field.required ? "#b4501d" : "#4c635f" }}>{field.required ? t("مطلوب", "Required") : t("اختياري", "Optional")}</span>
              </div>
              <span style={{ fontSize: 13.5, lineHeight: 1.7 }}>{field.description}</span>
              <span style={{ fontSize: 12.5, opacity: 0.75 }}>{t("مثال:", "Example:")} <code dir="ltr">{field.example}</code></span>
            </div>
          ))}
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
  const [layout, setLayout] = useState<"board" | "table">("board");
  const [localStages, setLocalStages] = useState<Record<string, PipelineStage>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [savingValueId, setSavingValueId] = useState<string | null>(null);
  const [templateMenuId, setTemplateMenuId] = useState<string | null>(null);
  const [automationMenuId, setAutomationMenuId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<LeadFilters>(EMPTY_LEAD_FILTERS);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function stageOf(conversation: Conversation): PipelineStage {
    return localStages[conversation.id] ?? (conversation.pipelineStage as PipelineStage) ?? "جديد";
  }

  const filterOptions = useMemo(() => buildFilterOptions(conversations), [conversations]);
  const visibleConversations = useMemo(
    () => applyLeadFilters(conversations, filters, (conversation) => stageOf(conversation)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversations, filters, localStages]
  );

  const columns = useMemo(() => {
    const map = new Map<PipelineStage, Conversation[]>(pipelineStages.map((stage) => [stage, [] as Conversation[]]));
    for (const conversation of visibleConversations) {
      map.get(stageOf(conversation))?.push(conversation);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleConversations, localStages]);

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
      <PageHero
        eyebrow={t("العمل اليومي", "DAILY WORK")}
        title={t("العملاء المحتملون", "Leads")}
        description={t("استقبل الليدات من منصة خارجية أو تابع العملاء المحتملين داخل لنكلي حسب المرحلة.", "Receive leads from an external platform or track leads inside Linkly by stage.")}
        chips={[t(`${conversations.length} ليد`, `${conversations.length} leads`), t(`${conversations.filter((conversation) => conversation.pipelineStage === "فاز").length} تم بيعها`, `${conversations.filter((conversation) => conversation.pipelineStage === "فاز").length} sold`)]}
      />
      <div className="pipeline-head">
        <div className="pipeline-tabs" role="tablist" aria-label={t("تبويبات العملاء المحتملين", "Leads tabs")}>
          <button type="button" role="tab" aria-selected={activeTab === "external"} onClick={() => setActiveTab("external")}>{t("ربط منصة خارجية", "External platform")}</button>
          <button type="button" role="tab" aria-selected={activeTab === "links"} onClick={() => setActiveTab("links")}>{t("روابط الإعلانات", "Ad links")}</button>
          <button type="button" role="tab" aria-selected={activeTab === "internal"} onClick={() => setActiveTab("internal")}>{t("داخل المنصة", "Inside platform")}</button>
        </div>
      </div>
      {activeTab === "links" ? <WaLinksTab t={t} /> : activeTab === "external" ? <ExternalLeadsTab t={t} onShowInternal={() => setActiveTab("internal")} onRefresh={onRefreshData} /> : (
        <div className="lead-internal">
          <div className="pipeline-tabs lead-layout-switch" role="group" aria-label={t("طريقة العرض", "View")}>
            <button type="button" aria-pressed={layout === "board"} onClick={() => setLayout("board")}>{t("لوحة", "Board")}</button>
            <button type="button" aria-pressed={layout === "table"} onClick={() => setLayout("table")}>{t("جدول", "Table")}</button>
          </div>
          <LeadFiltersBar filters={filters} options={filterOptions} total={conversations.length} shown={visibleConversations.length} onChange={setFilters} />
          {layout === "table" ? (
            <InternalLeadsTable
              conversations={visibleConversations}
              t={t}
              savingValueId={savingValueId}
              onMove={moveConversation}
              onSetDealValue={setDealValue}
              onOpenConversation={onOpenConversation}
            />
          ) : (
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
          )}
        </div>
      )}
    </section>
  );
}
