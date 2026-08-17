"use client";

import { FormEvent, useEffect, useState } from "react";

type BotNode = {
  id: string;
  type: string;
  title: string;
  content: string;
};

type BotChannel = "whatsapp" | "telegram" | "instagram" | "facebook" | "x" | "website";

const nodeTypes = ["إرسال رسالة", "إرسال قائمة قصيرة", "إرسال قائمة طويلة", "تحويل لفريق", "إغلاق المحادثة"];

const channels: { id: BotChannel; label: string }[] = [
  { id: "whatsapp", label: "واتساب" },
  { id: "telegram", label: "تيليجرام" },
  { id: "instagram", label: "إنستقرام" },
  { id: "facebook", label: "فيسبوك" },
  { id: "x", label: "X" },
  { id: "website", label: "الموقع" }
];

export default function BotView() {
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

  const channelLabel = channels.find((item) => item.id === channel)?.label || "";
  const isListType = nodeType === "إرسال قائمة قصيرة" || nodeType === "إرسال قائمة طويلة";

  return (
    <section className="page-stack">
      <div className="page-hero">
        <div>
          <h1>الرد الآلي</h1>
          <p>أنشئ روبوت محادثة يرحب بالعميل من أول رسالة، يعرض له الخيارات المناسبة، يرسل ردوداً جاهزة، ويحوّل المحادثة للفريق الصحيح عند الحاجة. لكل قناة إعداد وخطوات مستقلة. عند خطوة "قائمة" يتوقف الرد الآلي وينتظر رد العميل، ثم يتفرّع لخطوة مختلفة حسب اختياره — استخدم رمز {"=>"} بعد كل خيار لتحديد اسم الخطوة التي ينتقل لها.</p>
        </div>
        <div className="bot-hero-actions">
          <label className="bot-toggle">
            <input type="checkbox" checked={enabled} onChange={toggleEnabled} disabled={loading} />
            <span>{enabled ? `الرد الآلي مفعّل (${channelLabel})` : `الرد الآلي متوقف (${channelLabel})`}</span>
          </label>
          <button className="btn primary" type="button" onClick={() => setBuilderOpen(true)}>＋ إضافة خطوة</button>
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
            {item.label}
          </button>
        ))}
      </div>

      <div className="bot-canvas">
        <div className="bot-toolbar"><b>مخطط الرد الآلي ({channelLabel})</b><span>الخطوات تُنفَّذ بالترتيب، وتتوقف عند أي خطوة "قائمة" لحين رد العميل، ثم تتفرّع حسب اختياره</span></div>
        <div className="bot-node start"><b>البداية</b><small>عند وصول رسالة جديدة على {channelLabel}</small></div>
        {nodes.map((node, index) => (
          <div className={`bot-node ${index % 2 ? "menu-node" : "reply"}`} key={node.id}>
            <b>{node.title}</b>
            <small>{node.content}</small>
          </div>
        ))}
        {!loading && !nodes.length ? (
          <div className="bot-node reply"><b>لا توجد خطوات بعد</b><small>اضغط "إضافة خطوة" لإنشاء أول خطوة في الرد الآلي.</small></div>
        ) : null}
      </div>

      {builderOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setBuilderOpen(false)}>
          <div className="account-modal form-modal bot-builder-modal" role="dialog" aria-modal="true" aria-label="إدارة خطوات الرد الآلي" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label="إغلاق" onClick={() => setBuilderOpen(false)}>×</button>
              <h2>خطوات الرد الآلي — {channelLabel}</h2>
            </header>
            <div className="account-modal-body">
              <form className="form-grid" onSubmit={addNode}>
                <div className="split-fields">
                  <label>
                    <span>نوع الخطوة</span>
                    <select value={nodeType} onChange={(event) => setNodeType(event.target.value)}>
                      {nodeTypes.map((type) => <option key={type}>{type}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>اسم الخطوة</span>
                    <input value={nodeTitle} onChange={(event) => setNodeTitle(event.target.value)} placeholder="مثال: ترحيب أولي" />
                  </label>
                </div>
                <label>
                  <span>
                    {nodeType === "تحويل لفريق"
                      ? "اسم الفريق أو الموظف"
                      : isListType
                        ? "الخيارات (كل خيار بسطر مستقل، وأضف => اسم الخطوة الهدف للتفرّع)"
                        : "المحتوى"}
                  </span>
                  <textarea
                    value={nodeContent}
                    onChange={(event) => setNodeContent(event.target.value)}
                    placeholder={isListType ? "مثال:\nتتبع الطلب => تتبع الطلب\nالتحدث لموظف => تحويل للدعم" : "اكتب الرسالة التي ستُرسل للعميل"}
                    rows={4}
                    required
                  />
                </label>
                <button className="btn primary" type="submit" disabled={saving}>＋ إضافة خطوة</button>
              </form>

              <div className="bot-builder-list">
                {nodes.map((node) => (
                  <div className="bot-builder-node" key={node.id}>
                    <div>
                      <b>{node.title}</b>
                      <span>{node.type}</span>
                      <small>{node.content}</small>
                    </div>
                    <button className="btn danger" type="button" onClick={() => removeNode(node.id)}>حذف</button>
                  </div>
                ))}
              </div>
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setBuilderOpen(false)}>إغلاق</button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
