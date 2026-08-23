"use client";

import { FormEvent, useEffect, useState } from "react";
import { useLanguage } from "../i18n";

type BotNode = {
  id: string;
  type: string;
  title: string;
  content: string;
};

type BotChannel = "whatsapp" | "telegram" | "instagram" | "facebook" | "x" | "website";

const nodeTypes = ["إرسال رسالة", "إرسال قائمة قصيرة", "إرسال قائمة طويلة", "تحويل لفريق", "إغلاق المحادثة"];

const nodeTypeLabelsEn: Record<string, string> = {
  "إرسال رسالة": "Send a message",
  "إرسال قائمة قصيرة": "Send a short list",
  "إرسال قائمة طويلة": "Send a long list",
  "تحويل لفريق": "Transfer to a team",
  "إغلاق المحادثة": "Close the conversation"
};

function nodeTypeLabel(type: string, t: (ar: string, en: string) => string) {
  return t(type, nodeTypeLabelsEn[type] || type);
}

const channels: { id: BotChannel; label: string }[] = [
  { id: "whatsapp", label: "واتساب" },
  { id: "telegram", label: "تيليجرام" },
  { id: "instagram", label: "إنستقرام" },
  { id: "facebook", label: "فيسبوك" },
  { id: "x", label: "X" },
  { id: "website", label: "الموقع" }
];

const channelLabelsEn: Record<BotChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  website: "Website"
};

export default function BotView() {
  const { t } = useLanguage();
  const [channel, setChannel] = useState<BotChannel>("whatsapp");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [nodes, setNodes] = useState<BotNode[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nodeType, setNodeType] = useState(nodeTypes[0]);
  const [nodeTitle, setNodeTitle] = useState("");
  const [nodeContent, setNodeContent] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [settingsRes, nodesRes] = await Promise.all([
        fetch(`/api/bot/settings?channel=${channel}`).then((response) => response.json()).catch(() => null),
        fetch(`/api/bot/nodes?channel=${channel}`).then((response) => response.json()).catch(() => null)
      ]);
      if (cancelled) return;
      setEnabled(settingsRes?.ok ? Boolean(settingsRes.data?.enabled) : false);
      setNodes(nodesRes?.ok ? nodesRes.data || [] : []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [channel]);

  async function persistNodes(nextNodes: BotNode[]) {
    setSaving(true);
    await fetch(`/api/bot/nodes?channel=${channel}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: nextNodes.map(({ type, title, content }) => ({ type, title, content })) })
    });
    setSaving(false);
  }

  async function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    await fetch(`/api/bot/settings?channel=${channel}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next })
    });
  }

  async function addNode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = nodeContent.trim();
    if (!content) return;

    const nextNodes = [
      ...nodes,
      {
        id: `local-${Date.now()}`,
        type: nodeType,
        title: nodeTitle.trim() || nodeType,
        content
      }
    ];
    setNodes(nextNodes);
    setNodeTitle("");
    setNodeContent("");
    await persistNodes(nextNodes);
  }

  async function removeNode(id: string) {
    const nextNodes = nodes.filter((node) => node.id !== id);
    setNodes(nextNodes);
    await persistNodes(nextNodes);
  }

  const channelLabel = t(channels.find((item) => item.id === channel)?.label || "", channelLabelsEn[channel] || "");
  const isListType = nodeType === "إرسال قائمة قصيرة" || nodeType === "إرسال قائمة طويلة";

  return (
    <section className="page-stack">
      <div className="page-hero">
        <div>
          <h1>{t("الرد الآلي", "Auto Reply")}</h1>
          <p>{t(
            'أنشئ روبوت محادثة يرحب بالعميل من أول رسالة، يعرض له الخيارات المناسبة، يرسل ردوداً جاهزة، ويحوّل المحادثة للفريق الصحيح عند الحاجة. لكل قناة إعداد وخطوات مستقلة. عند خطوة "قائمة" يتوقف الرد الآلي وينتظر رد العميل، ثم يتفرّع لخطوة مختلفة حسب اختياره — استخدم رمز {"=>"} بعد كل خيار لتحديد اسم الخطوة التي ينتقل لها.',
            'Create a chatbot that welcomes the customer from the first message, shows them the right options, sends ready-made replies, and transfers the conversation to the right team when needed. Each channel has its own independent setup and steps. At a "list" step, the auto reply pauses and waits for the customer\'s reply, then branches to a different step based on their choice — use the {"=>"} symbol after each option to set the name of the step it moves to.'
          )}</p>
        </div>
        <div className="bot-hero-actions">
          <label className="bot-toggle">
            <input type="checkbox" checked={enabled} onChange={toggleEnabled} disabled={loading} />
            <span>{enabled ? t(`الرد الآلي مفعّل (${channelLabel})`, `Auto reply enabled (${channelLabel})`) : t(`الرد الآلي متوقف (${channelLabel})`, `Auto reply disabled (${channelLabel})`)}</span>
          </label>
          <button className="btn primary" type="button" onClick={() => setBuilderOpen(true)}>＋ {t("إضافة خطوة", "Add step")}</button>
        </div>
      </div>

      <div className="bot-channel-tabs">
        {channels.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`bot-channel-tab ${channel === item.id ? "active" : ""}`}
            onClick={() => setChannel(item.id)}
          >
            {t(item.label, channelLabelsEn[item.id])}
          </button>
        ))}
      </div>

      <div className="bot-canvas">
        <div className="bot-toolbar"><b>{t(`مخطط الرد الآلي (${channelLabel})`, `Auto reply flow (${channelLabel})`)}</b><span>{t('الخطوات تُنفَّذ بالترتيب، وتتوقف عند أي خطوة "قائمة" لحين رد العميل، ثم تتفرّع حسب اختياره', 'Steps run in order, and pause at any "list" step until the customer replies, then branch based on their choice')}</span></div>
        <div className="bot-node start"><b>{t("البداية", "Start")}</b><small>{t(`عند وصول رسالة جديدة على ${channelLabel}`, `When a new message arrives on ${channelLabel}`)}</small></div>
        {nodes.map((node, index) => (
          <div className={`bot-node ${index % 2 ? "menu-node" : "reply"}`} key={node.id}>
            <b>{node.title}</b>
            <small>{node.content}</small>
          </div>
        ))}
        {!loading && !nodes.length ? (
          <div className="bot-node reply"><b>{t("لا توجد خطوات بعد", "No steps yet")}</b><small>{t('اضغط "إضافة خطوة" لإنشاء أول خطوة في الرد الآلي.', 'Click "Add step" to create the first step in the auto reply.')}</small></div>
        ) : null}
      </div>

      {builderOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setBuilderOpen(false)}>
          <div className="account-modal form-modal bot-builder-modal" role="dialog" aria-modal="true" aria-label={t("إدارة خطوات الرد الآلي", "Manage auto reply steps")} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setBuilderOpen(false)}>×</button>
              <h2>{t(`خطوات الرد الآلي — ${channelLabel}`, `Auto reply steps — ${channelLabel}`)}</h2>
            </header>
            <div className="account-modal-body">
              <form className="form-grid" onSubmit={addNode}>
                <div className="split-fields">
                  <label>
                    <span>{t("نوع الخطوة", "Step type")}</span>
                    <select value={nodeType} onChange={(event) => setNodeType(event.target.value)}>
                      {nodeTypes.map((type) => <option key={type} value={type}>{nodeTypeLabel(type, t)}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>{t("اسم الخطوة", "Step name")}</span>
                    <input value={nodeTitle} onChange={(event) => setNodeTitle(event.target.value)} placeholder={t("مثال: ترحيب أولي", "Example: initial welcome")} />
                  </label>
                </div>
                <label>
                  <span>
                    {nodeType === "تحويل لفريق"
                      ? t("اسم الفريق أو الموظف", "Team or employee name")
                      : isListType
                        ? t("الخيارات (كل خيار بسطر مستقل، وأضف => اسم الخطوة الهدف للتفرّع)", "Options (each option on its own line, add => target step name to branch)")
                        : t("المحتوى", "Content")}
                  </span>
                  <textarea
                    value={nodeContent}
                    onChange={(event) => setNodeContent(event.target.value)}
                    placeholder={isListType ? t("مثال:\nتتبع الطلب => تتبع الطلب\nالتحدث لموظف => تحويل للدعم", "Example:\nTrack order => Track order\nTalk to an agent => Transfer to support") : t("اكتب الرسالة التي ستُرسل للعميل", "Write the message that will be sent to the customer")}
                    rows={4}
                    required
                  />
                </label>
                <button className="btn primary" type="submit" disabled={saving}>＋ {t("إضافة خطوة", "Add step")}</button>
              </form>

              <div className="bot-builder-list">
                {nodes.map((node) => (
                  <div className="bot-builder-node" key={node.id}>
                    <div>
                      <b>{node.title}</b>
                      <span>{nodeTypeLabel(node.type, t)}</span>
                      <small>{node.content}</small>
                    </div>
                    <button className="btn danger" type="button" onClick={() => removeNode(node.id)}>{t("حذف", "Delete")}</button>
                  </div>
                ))}
              </div>
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setBuilderOpen(false)}>{t("إغلاق", "Close")}</button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
