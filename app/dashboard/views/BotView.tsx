"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";
import type { Team } from "../types";

type BotNode = {
  id: string;
  type: string;
  title: string;
  content: string;
  x: number;
  y: number;
};

type BotChannel = "whatsapp" | "telegram" | "instagram" | "facebook" | "x" | "website";

const nodeTypes = ["إرسال رسالة", "إرسال قائمة قصيرة", "إرسال قائمة طويلة", "تحويل لفريق", "إغلاق المحادثة"];
const LIST_NODE_TYPES = new Set(["إرسال قائمة قصيرة", "إرسال قائمة طويلة"]);
const TERMINAL_NODE_TYPES = new Set(["تحويل لفريق", "إغلاق المحادثة"]);

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

// Node cards aren't a fixed height (content wraps), so connector anchors
// use an approximate vertical center rather than measuring the real DOM box.
const NODE_WIDTH = 240;
const NODE_ANCHOR_Y = 44;
const START_POSITION = { x: 24, y: 160 };
const DRAG_CLICK_THRESHOLD = 5;

// Option lines look like "نص الخيار" or "نص الخيار => اسم الخطوة الهدف".
function parseListOptions(content: string) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, target] = line.split("=>").map((part) => part.trim());
      return { label: label || line, target: target || "" };
    });
}

// Mirrors the server-side execution order in lib/bot-engine.ts: list nodes
// only advance via their parsed option targets, terminal nodes advance
// nowhere, and a plain node's implicit "next" link is suppressed when the
// following node is actually a branch entry point for some list node (so a
// sibling branch doesn't visually appear to chain off the previous one).
function computeEdges(nodes: BotNode[]) {
  const branchTargets = new Set<string>();
  const branchEdges: Array<{ from: string; to: string }> = [];

  for (const node of nodes) {
    if (!LIST_NODE_TYPES.has(node.type)) continue;
    for (const option of parseListOptions(node.content)) {
      if (!option.target) continue;
      branchTargets.add(option.target);
      const target = nodes.find((candidate) => candidate.title === option.target);
      if (target) branchEdges.push({ from: node.id, to: target.id });
    }
  }

  const edges: Array<{ from: string; to: string }> = [];
  if (nodes[0]) edges.push({ from: "start", to: nodes[0].id });

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (LIST_NODE_TYPES.has(node.type) || TERMINAL_NODE_TYPES.has(node.type)) continue;
    const next = nodes[i + 1];
    if (next && !branchTargets.has(next.title)) edges.push({ from: node.id, to: next.id });
  }

  return [...edges, ...branchEdges];
}

function layoutLegacyNodes(nodes: BotNode[]): BotNode[] {
  const needsLayout = nodes.every((node) => !node.x && !node.y);
  if (!needsLayout || !nodes.length) return nodes;
  return nodes.map((node, index) => ({ ...node, x: START_POSITION.x + 280 + index * 280, y: START_POSITION.y }));
}

export default function BotView({ teams }: { teams: Team[] }) {
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
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; pointerId: number; startClientX: number; startClientY: number; origX: number; origY: number; moved: boolean } | null>(null);

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
      setNodes(layoutLegacyNodes(nodesRes?.ok ? nodesRes.data || [] : []));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [channel]);

  async function persistNodes(nextNodes: BotNode[]) {
    setSaving(true);
    const response = await fetch(`/api/bot/nodes?channel=${channel}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: nextNodes.map(({ type, title, content, x, y }) => ({ type, title, content, x, y })) })
    }).then((res) => res.json()).catch(() => null);
    if (response?.ok) setNodes(response.data || nextNodes);
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

  function openAddModal() {
    setEditingNodeId(null);
    setNodeType(nodeTypes[0]);
    setNodeTitle("");
    setNodeContent("");
    setBuilderOpen(true);
  }

  function openEditModal(node: BotNode) {
    setEditingNodeId(node.id);
    setNodeType(node.type);
    setNodeTitle(node.title);
    setNodeContent(node.content);
    setBuilderOpen(true);
  }

  async function submitNode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = nodeContent.trim();
    if (!content) return;
    const title = nodeTitle.trim() || nodeType;

    let nextNodes: BotNode[];
    if (editingNodeId) {
      nextNodes = nodes.map((node) => (node.id === editingNodeId ? { ...node, type: nodeType, title, content } : node));
    } else {
      const maxX = nodes.length ? Math.max(...nodes.map((node) => node.x)) : START_POSITION.x + 280 - 280;
      nextNodes = [
        ...nodes,
        { id: `local-${Date.now()}`, type: nodeType, title, content, x: maxX + 280, y: START_POSITION.y }
      ];
    }
    setNodes(nextNodes);
    setBuilderOpen(false);
    await persistNodes(nextNodes);
  }

  async function removeNode(id: string) {
    const nextNodes = nodes.filter((node) => node.id !== id);
    setNodes(nextNodes);
    setBuilderOpen(false);
    await persistNodes(nextNodes);
  }

  function handleNodePointerDown(event: ReactPointerEvent<HTMLDivElement>, node: BotNode) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: node.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      origX: node.x,
      origY: node.y,
      moved: false
    };
  }

  function handleNodePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startClientX;
    const deltaY = event.clientY - drag.startClientY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < DRAG_CLICK_THRESHOLD) return;
    drag.moved = true;
    const nextX = Math.max(0, drag.origX + deltaX);
    const nextY = Math.max(0, drag.origY + deltaY);
    setNodes((current) => current.map((node) => (node.id === drag.id ? { ...node, x: nextX, y: nextY } : node)));
  }

  function handleNodePointerUp(event: ReactPointerEvent<HTMLDivElement>, node: BotNode) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.moved) {
      void persistNodes(nodes);
    } else {
      openEditModal(node);
    }
  }

  const channelLabel = t(channels.find((item) => item.id === channel)?.label || "", channelLabelsEn[channel] || "");
  const isListType = nodeType === "إرسال قائمة قصيرة" || nodeType === "إرسال قائمة طويلة";
  const edges = useMemo(() => computeEdges(nodes), [nodes]);
  const canvasSize = useMemo(() => {
    const maxX = nodes.reduce((max, node) => Math.max(max, node.x + NODE_WIDTH + 60), START_POSITION.x + 400);
    const maxY = nodes.reduce((max, node) => Math.max(max, node.y + 160), START_POSITION.y + 260);
    return { width: maxX, height: maxY };
  }, [nodes]);

  function nodePoint(id: string): { x: number; y: number } {
    if (id === "start") return { x: START_POSITION.x, y: START_POSITION.y + NODE_ANCHOR_Y };
    const node = nodes.find((item) => item.id === id);
    return node ? { x: node.x, y: node.y + NODE_ANCHOR_Y } : { x: 0, y: 0 };
  }

  return (
    <section className="page-stack">
      <div className="page-hero">
        <div>
          <h1>{t("الرد الآلي", "Auto Reply")}</h1>
          <p>{t(
            'أنشئ روبوت محادثة يرحب بالعميل من أول رسالة، يعرض له الخيارات المناسبة، يرسل ردوداً جاهزة، ويحوّل المحادثة للفريق الصحيح عند الحاجة. لكل قناة إعداد وخطوات مستقلة. اسحب أي خطوة لإعادة ترتيبها على المخطط، أو اضغط عليها لتعديلها مباشرة. عند خطوة "قائمة" يتوقف الرد الآلي وينتظر رد العميل، ثم يتفرّع لخطوة مختلفة حسب اختياره — استخدم رمز {"=>"} بعد كل خيار لتحديد اسم الخطوة التي ينتقل لها.',
            'Create a chatbot that welcomes the customer from the first message, shows them the right options, sends ready-made replies, and transfers the conversation to the right team when needed. Each channel has its own independent setup and steps. Drag any step to reposition it on the diagram, or click it to edit it directly. At a "list" step, the auto reply pauses and waits for the customer\'s reply, then branches to a different step based on their choice — use the {"=>"} symbol after each option to set the name of the step it moves to.'
          )}</p>
        </div>
        <div className="bot-hero-actions">
          <label className="bot-toggle">
            <input type="checkbox" checked={enabled} onChange={toggleEnabled} disabled={loading} />
            <span>{enabled ? t(`الرد الآلي مفعّل (${channelLabel})`, `Auto reply enabled (${channelLabel})`) : t(`الرد الآلي متوقف (${channelLabel})`, `Auto reply disabled (${channelLabel})`)}</span>
          </label>
          <button className="btn primary" type="button" onClick={openAddModal}>＋ {t("إضافة خطوة", "Add step")}</button>
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

      <div className="bot-canvas" ref={canvasRef} dir="ltr">
        <div className="bot-toolbar" dir="auto"><b>{t(`مخطط الرد الآلي (${channelLabel})`, `Auto reply flow (${channelLabel})`)}</b><span>{t('اسحب أي خطوة لتحريكها، أو اضغط عليها لفتحها للتعديل', 'Drag any step to move it, or click it to open it for editing')}</span></div>
        <div className="bot-flow-surface" style={{ width: canvasSize.width, height: canvasSize.height }}>
          <svg className="bot-flow-edges" width={canvasSize.width} height={canvasSize.height}>
            {edges.map((edge) => {
              const from = nodePoint(edge.from);
              const to = nodePoint(edge.to);
              const fromX = from.x + NODE_WIDTH;
              const midX = (fromX + to.x) / 2;
              return (
                <path
                  key={`${edge.from}-${edge.to}`}
                  d={`M ${fromX} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`}
                  fill="none"
                />
              );
            })}
          </svg>

          <div className="bot-node start bot-flow-node" style={{ left: START_POSITION.x, top: START_POSITION.y, width: NODE_WIDTH }} dir="auto">
            <b>{t("البداية", "Start")}</b>
            <small>{t(`عند وصول رسالة جديدة على ${channelLabel}`, `When a new message arrives on ${channelLabel}`)}</small>
          </div>

          {nodes.map((node) => (
            <div
              className={`bot-node bot-flow-node ${LIST_NODE_TYPES.has(node.type) ? "menu-node" : TERMINAL_NODE_TYPES.has(node.type) ? "terminal-node" : "reply"}`}
              key={node.id}
              dir="auto"
              style={{ left: node.x, top: node.y, width: NODE_WIDTH }}
              onPointerDown={(event) => handleNodePointerDown(event, node)}
              onPointerMove={handleNodePointerMove}
              onPointerUp={(event) => handleNodePointerUp(event, node)}
            >
              <b>{node.title}</b>
              <small>{node.content}</small>
            </div>
          ))}

          {!loading && !nodes.length ? (
            <div className="bot-node reply bot-flow-node" style={{ left: START_POSITION.x + 280, top: START_POSITION.y, width: NODE_WIDTH }} dir="auto">
              <b>{t("لا توجد خطوات بعد", "No steps yet")}</b>
              <small>{t('اضغط "إضافة خطوة" لإنشاء أول خطوة في الرد الآلي.', 'Click "Add step" to create the first step in the auto reply.')}</small>
            </div>
          ) : null}
        </div>
      </div>

      {builderOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setBuilderOpen(false)}>
          <div className="account-modal form-modal bot-builder-modal" role="dialog" aria-modal="true" aria-label={t("إدارة خطوات الرد الآلي", "Manage auto reply steps")} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setBuilderOpen(false)}>×</button>
              <h2>{editingNodeId ? t(`تعديل خطوة — ${channelLabel}`, `Edit step — ${channelLabel}`) : t(`إضافة خطوة — ${channelLabel}`, `Add step — ${channelLabel}`)}</h2>
            </header>
            <div className="account-modal-body">
              <form className="form-grid" onSubmit={submitNode}>
                <div className="split-fields">
                  <label>
                    <span>{t("نوع الخطوة", "Step type")}</span>
                    <CustomSelect
                      value={nodeType}
                      onChange={setNodeType}
                      options={nodeTypes.map((type) => ({ value: type, label: nodeTypeLabel(type, t) }))}
                    />
                  </label>
                  <label>
                    <span>{t("اسم الخطوة", "Step name")}</span>
                    <input value={nodeTitle} onChange={(event) => setNodeTitle(event.target.value)} placeholder={t("مثال: ترحيب أولي", "Example: initial welcome")} />
                  </label>
                </div>
                <label>
                  <span>
                    {nodeType === "تحويل لفريق"
                      ? t("الفريق", "Team")
                      : isListType
                        ? t("الخيارات (كل خيار بسطر مستقل، وأضف => اسم الخطوة الهدف للتفرّع)", "Options (each option on its own line, add => target step name to branch)")
                        : t("المحتوى", "Content")}
                  </span>
                  {nodeType === "تحويل لفريق" ? (
                    teams.length ? (
                      <CustomSelect
                        value={nodeContent}
                        onChange={setNodeContent}
                        options={teams.map((team) => ({ value: team.name, label: team.name }))}
                        placeholder={t("اختر فريق", "Choose a team")}
                      />
                    ) : (
                      <p className="muted-copy">{t("ما فيه فرق منشأة بعد. أنشئ فريق أولاً من صفحة الفرق.", "No teams created yet. Create a team first from the Teams page.")}</p>
                    )
                  ) : (
                    <textarea
                      value={nodeContent}
                      onChange={(event) => setNodeContent(event.target.value)}
                      placeholder={isListType ? t("مثال:\nتتبع الطلب => تتبع الطلب\nالتحدث لموظف => تحويل للدعم", "Example:\nTrack order => Track order\nTalk to an agent => Transfer to support") : t("اكتب الرسالة التي ستُرسل للعميل", "Write the message that will be sent to the customer")}
                      rows={4}
                      required
                    />
                  )}
                </label>
                <div className="split-fields">
                  <button className="btn primary" type="submit" disabled={saving}>
                    {editingNodeId ? t("حفظ التعديل", "Save changes") : `＋ ${t("إضافة خطوة", "Add step")}`}
                  </button>
                  {editingNodeId ? (
                    <button className="btn danger" type="button" disabled={saving} onClick={() => removeNode(editingNodeId)}>
                      {t("حذف الخطوة", "Delete step")}
                    </button>
                  ) : null}
                </div>
              </form>
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
