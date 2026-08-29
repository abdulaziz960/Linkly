"use client";

import { DragEvent, FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";
import type { Employee, Team } from "../types";

type BotListOption = { id: string; label: string; next: string | null };

type BotNodeContent =
  | { kind: "message"; text: string; next: string | null }
  | { kind: "list"; text: string; options: BotListOption[] }
  | { kind: "team"; teamName: string }
  | { kind: "employee"; employeeName: string }
  | { kind: "close"; text: string };

type BotNode = {
  id: string;
  type: string;
  title: string;
  content: BotNodeContent;
  x: number;
  y: number;
};

type BotChannel = "whatsapp" | "telegram" | "instagram" | "facebook" | "x" | "website";

type ReadyNodeTemplate = {
  key: string;
  type: string;
  title: string;
  content:
    | { kind: "message"; text: string; nextKey?: string }
    | { kind: "list"; text: string; options: Array<{ label: string; nextKey?: string }> }
    | { kind: "team"; teamName: string }
    | { kind: "close"; text: string };
};

type ReadyStep = {
  id: string;
  icon: string;
  title: string;
  description: string;
  nodes: ReadyNodeTemplate[];
  kind?: "flow" | "step";
};

const nodeTypes = ["إرسال رسالة", "إرسال قائمة قصيرة", "إرسال قائمة طويلة", "تحويل لفريق", "تحويل لموظف", "إغلاق المحادثة"];
const LIST_NODE_TYPES = new Set(["إرسال قائمة قصيرة", "إرسال قائمة طويلة"]);
const TERMINAL_NODE_TYPES = new Set(["تحويل لفريق", "تحويل لموظف", "إغلاق المحادثة"]);

const nodeTypeLabelsEn: Record<string, string> = {
  "إرسال رسالة": "Send a message",
  "إرسال قائمة قصيرة": "Send a short list",
  "إرسال قائمة طويلة": "Send a long list",
  "تحويل لفريق": "Transfer to a team",
  "تحويل لموظف": "Transfer to an employee",
  "إغلاق المحادثة": "Close the conversation"
};

const readySteps: ReadyStep[] = [
  {
    id: "welcome",
    icon: "👋",
    title: "رسالة ترحيب",
    description: "ترحيب مختصر يوضح للعميل أن الرد فوري.",
    nodes: [{ key: "welcome", type: "إرسال رسالة", title: "الترحيب", content: { kind: "message", text: "أهلًا وسهلًا بك 👋\nيسعدنا خدمتك، اختر من القائمة التالية ما يناسبك." } }]
  },
  {
    id: "main-menu",
    icon: "☷",
    title: "قائمة الخدمات",
    description: "ثلاثة خيارات جاهزة توجّه العميل للمسار الصحيح.",
    nodes: [{ key: "menu",
      type: "إرسال قائمة قصيرة",
      title: "القائمة الرئيسية",
      content: { kind: "list", text: "كيف نقدر نساعدك؟", options: [{ label: "الخدمات والأسعار" }, { label: "متابعة طلب" }, { label: "التحدث مع موظف" }] }
    }]
  },
  {
    id: "pricing",
    icon: "◈",
    title: "الخدمات والأسعار",
    description: "رد جاهز لعرض الخدمات ثم دعوة العميل للتواصل.",
    nodes: [{ key: "pricing", type: "إرسال رسالة", title: "الخدمات والأسعار", content: { kind: "message", text: "يسعدنا توضيح الخدمات والأسعار المناسبة لك. اكتب الخدمة المطلوبة وسيتواصل معك الفريق بالتفاصيل." } }]
  },
  {
    id: "order-status",
    icon: "⌕",
    title: "متابعة طلب",
    description: "يطلب رقم الطلب من العميل بطريقة واضحة.",
    nodes: [{ key: "order", type: "إرسال رسالة", title: "متابعة طلب", content: { kind: "message", text: "أرسل رقم الطلب أو رقم الجوال المسجل، وسيقوم الفريق بمتابعته معك." } }]
  },
  {
    id: "transfer",
    icon: "↗",
    title: "تحويل لموظف",
    description: "يحوّل المحادثة مباشرة إلى فريق خدمة العملاء.",
    nodes: [{ key: "transfer", type: "تحويل لفريق", title: "تحويل للدعم", content: { kind: "team", teamName: "__DEFAULT_TEAM__" } }]
  },
  {
    id: "working-hours",
    icon: "◷",
    title: "خارج أوقات العمل",
    description: "يطمئن العميل أن الفريق سيرد في أقرب وقت.",
    nodes: [{ key: "hours", type: "إرسال رسالة", title: "خارج أوقات العمل", content: { kind: "message", text: "شكرًا لتواصلك. نحن الآن خارج أوقات العمل، وتم استلام رسالتك وسنرد عليك في أقرب وقت." } }]
  },
  {
    id: "close",
    icon: "✓",
    title: "إنهاء المحادثة",
    description: "رسالة ختامية ثم إغلاق المحادثة.",
    nodes: [{ key: "close", type: "إغلاق المحادثة", title: "إنهاء المحادثة", content: { kind: "close", text: "شكرًا لتواصلك معنا، سعدنا بخدمتك 🌟" } }]
  },
  {
    id: "customer-service-flow",
    icon: "⚡",
    title: "مسار خدمة عملاء كامل",
    description: "ترحيب + قائمة خدمات + متابعة طلب + تحويل للدعم.",
    kind: "flow",
    nodes: [
      { key: "welcome", type: "إرسال رسالة", title: "الترحيب", content: { kind: "message", text: "أهلًا وسهلًا بك 👋\nيسعدنا خدمتك، اختر من القائمة التالية ما يناسبك.", nextKey: "menu" } },
      { key: "menu", type: "إرسال قائمة قصيرة", title: "القائمة الرئيسية", content: { kind: "list", text: "كيف نقدر نساعدك؟", options: [{ label: "الخدمات والأسعار", nextKey: "pricing" }, { label: "متابعة طلب", nextKey: "order" }, { label: "التحدث مع موظف", nextKey: "transfer" }] } },
      { key: "pricing", type: "إرسال رسالة", title: "الخدمات والأسعار", content: { kind: "message", text: "يسعدنا توضيح الخدمات والأسعار المناسبة لك. اكتب الخدمة المطلوبة وسيتواصل معك الفريق بالتفاصيل." } },
      { key: "order", type: "إرسال رسالة", title: "متابعة طلب", content: { kind: "message", text: "أرسل رقم الطلب أو رقم الجوال المسجل، وسيقوم الفريق بمتابعته معك." } },
      { key: "transfer", type: "تحويل لفريق", title: "تحويل للدعم", content: { kind: "team", teamName: "__DEFAULT_TEAM__" } }
    ]
  },
  {
    id: "after-hours-flow",
    icon: "☾",
    title: "مسار خارج الدوام",
    description: "إشعار بالاستلام ثم تحويل الطلب للفريق للمتابعة.",
    kind: "flow",
    nodes: [
      { key: "hours", type: "إرسال رسالة", title: "خارج أوقات العمل", content: { kind: "message", text: "شكرًا لتواصلك. نحن الآن خارج أوقات العمل، وتم استلام رسالتك وسنرد عليك في أقرب وقت.", nextKey: "transfer" } },
      { key: "transfer", type: "تحويل لفريق", title: "متابعة الفريق", content: { kind: "team", teamName: "__DEFAULT_TEAM__" } }
    ]
  }
];

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

function emptyContentFor(type: string): BotNodeContent {
  if (LIST_NODE_TYPES.has(type)) return { kind: "list", text: "", options: [{ id: crypto.randomUUID(), label: "", next: null }] };
  if (type === "تحويل لفريق") return { kind: "team", teamName: "" };
  if (type === "تحويل لموظف") return { kind: "employee", employeeName: "" };
  if (type === "إغلاق المحادثة") return { kind: "close", text: "" };
  return { kind: "message", text: "", next: null };
}

// Node cards aren't a fixed height (content wraps), so connector anchors use
// an approximate box rather than measuring the real DOM element.
const NODE_WIDTH = 260;
const NODE_HEIGHT = 90;
const OPTION_ROW_HEIGHT = 34;
const START_POSITION = { x: 24, y: 160 };
const DRAG_CLICK_THRESHOLD = 5;

function outgoingLinks(node: BotNode): Array<{ from: string; to: string }> {
  if (node.content.kind === "message" && node.content.next) return [{ from: node.id, to: node.content.next }];
  if (node.content.kind === "list") {
    return node.content.options.filter((option) => option.next).map((option) => ({ from: `${node.id}:${option.id}`, to: option.next as string }));
  }
  return [];
}

// Where a connector dot sits for a given row, in canvas coordinates, and
// which node/option it belongs to - shared by both the dot rendering and the
// hit-testing that resolves a drag-to-connect drop.
function connectorAnchors(node: BotNode): Array<{ key: string; optionId: string | null; x: number; y: number }> {
  if (node.content.kind === "message") {
    return [{ key: node.id, optionId: null, x: node.x + NODE_WIDTH, y: node.y + 28 }];
  }
  if (node.content.kind === "list") {
    return node.content.options.map((option, index) => ({
      key: `${node.id}:${option.id}`,
      optionId: option.id,
      x: node.x + NODE_WIDTH,
      y: node.y + 56 + index * OPTION_ROW_HEIGHT + OPTION_ROW_HEIGHT / 2
    }));
  }
  return [];
}

export default function BotView({ teams, employees }: { teams: Team[]; employees: Employee[] }) {
  const { t } = useLanguage();
  const [channel, setChannel] = useState<BotChannel>("whatsapp");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [nodes, setNodes] = useState<BotNode[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nodeType, setNodeType] = useState(nodeTypes[0]);
  const [nodeTitle, setNodeTitle] = useState("");
  const [draftContent, setDraftContent] = useState<BotNodeContent>(emptyContentFor(nodeTypes[0]));
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<{ nodeId: string; optionId: string | null; x: number; y: number } | null>(null);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [draggedLibraryId, setDraggedLibraryId] = useState<string | null>(null);
  const [libraryFilter, setLibraryFilter] = useState<"all" | "step" | "flow">("all");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; pointerId: number; startClientX: number; startClientY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const visibleReadySteps = useMemo(
    () => readySteps.filter((item) => libraryFilter === "all" || (item.kind || "step") === libraryFilter),
    [libraryFilter]
  );

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
      const loadedNodes: BotNode[] = nodesRes?.ok ? nodesRes.data || [] : [];
      const needsLayout = loadedNodes.length > 0 && loadedNodes.every((node) => !node.x && !node.y);
      setNodes(needsLayout ? loadedNodes.map((node, index) => ({ ...node, x: START_POSITION.x + 320 + index * 320, y: START_POSITION.y })) : loadedNodes);
      setFeedback(null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [channel]);

  // Safety net: if the connection drag ends outside the canvas (no capture
  // is held on the dot, so a release there never reaches the canvas's own
  // pointerup handler), still clear the draft line instead of leaving it
  // stuck on screen.
  useEffect(() => {
    if (!connectingFrom) return;
    const clear = () => {
      setConnectingFrom(null);
      setDragPoint(null);
    };
    window.addEventListener("pointerup", clear);
    return () => window.removeEventListener("pointerup", clear);
  }, [connectingFrom]);

  async function persistNodes(nextNodes: BotNode[], previousNodes = nodes) {
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/bot/nodes?channel=${channel}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: nextNodes.map(({ id, type, title, content, x, y }) => ({ id, type, title, content, x, y })) })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "تعذر حفظ الخطوات");
      setNodes(payload.data || nextNodes);
      setFeedback({ type: "success", message: "تم حفظ مسار الرد الآلي تلقائيًا." });
      return true;
    } catch (error) {
      setNodes(previousNodes);
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "تعذر حفظ الخطوات." });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    setFeedback(null);
    try {
      const response = await fetch(`/api/bot/settings?channel=${channel}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next })
      });
      if (!response.ok) throw new Error("تعذر تغيير حالة الرد الآلي");
      setFeedback({ type: "success", message: next ? "تم تشغيل الرد الآلي لهذه القناة." : "تم إيقاف الرد الآلي لهذه القناة." });
    } catch (error) {
      setEnabled(!next);
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "تعذر تغيير حالة الرد الآلي." });
    }
  }

  function uniqueTitle(title: string, reserved: Set<string>) {
    if (!reserved.has(title)) {
      reserved.add(title);
      return title;
    }
    let counter = 2;
    while (reserved.has(`${title} ${counter}`)) counter += 1;
    const unique = `${title} ${counter}`;
    reserved.add(unique);
    return unique;
  }

  function instantiateReadyStep(item: ReadyStep, origin?: { x: number; y: number }): BotNode[] {
    const reserved = new Set(nodes.map((node) => node.title));
    const idByKey = new Map(item.nodes.map((node) => [node.key, `local-${crypto.randomUUID()}`]));
    const baseX = origin?.x ?? (nodes.length ? Math.max(...nodes.map((node) => node.x)) + 320 : START_POSITION.x + 320);
    const baseY = origin?.y ?? START_POSITION.y;

    return item.nodes.map((node, index) => {
      let content: BotNodeContent;
      if (node.content.kind === "message") {
        content = { kind: "message", text: node.content.text, next: node.content.nextKey ? idByKey.get(node.content.nextKey) || null : null };
      } else if (node.content.kind === "list") {
        content = {
          kind: "list",
          text: node.content.text,
          options: node.content.options.map((option) => ({ id: crypto.randomUUID(), label: option.label, next: option.nextKey ? idByKey.get(option.nextKey) || null : null }))
        };
      } else if (node.content.kind === "team") {
        content = { kind: "team", teamName: node.content.teamName === "__DEFAULT_TEAM__" ? teams[0]?.name || "" : node.content.teamName };
      } else {
        content = { kind: "close", text: node.content.text };
      }

      return {
        id: idByKey.get(node.key) as string,
        type: node.type,
        title: uniqueTitle(node.title, reserved),
        content,
        x: Math.max(START_POSITION.x + 300, baseX + (index % 3) * 320),
        y: Math.max(24, baseY + Math.floor(index / 3) * 210)
      };
    });
  }

  async function insertReadyStep(item: ReadyStep, origin?: { x: number; y: number }) {
    if (saving) return;
    const additions = instantiateReadyStep(item, origin);
    const nextNodes = [...nodes, ...additions];
    setNodes(nextNodes);
    await persistNodes(nextNodes, nodes);
  }

  function startLibraryDrag(event: DragEvent<HTMLElement>, item: ReadyStep) {
    setDraggedLibraryId(item.id);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-audiencew-bot", item.id);
  }

  async function handleLibraryDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (saving) return;
    const id = event.dataTransfer.getData("application/x-audiencew-bot") || draggedLibraryId;
    setDraggedLibraryId(null);
    const item = readySteps.find((step) => step.id === id);
    if (!item) return;
    await insertReadyStep(item, canvasPoint(event.clientX, event.clientY));
  }

  function openAddModal() {
    setEditingNodeId(null);
    setNodeType(nodeTypes[0]);
    setNodeTitle("");
    setDraftContent(emptyContentFor(nodeTypes[0]));
    setBuilderOpen(true);
  }

  function openEditModal(node: BotNode) {
    setEditingNodeId(node.id);
    setNodeType(node.type);
    setNodeTitle(node.title);
    setDraftContent(node.content);
    setBuilderOpen(true);
  }

  function changeNodeType(nextType: string) {
    setNodeType(nextType);
    // Only reset the draft when switching to a genuinely different shape -
    // flipping between the two list types should keep the options typed so far.
    const sameShape = LIST_NODE_TYPES.has(nextType) && draftContent.kind === "list";
    setDraftContent(sameShape ? draftContent : emptyContentFor(nextType));
  }

  // Clears any connection pointing at a step that no longer exists, so
  // deleting a step can never leave a dangling reference behind.
  function pruneLinksTo(list: BotNode[], removedId: string): BotNode[] {
    return list.map((node) => {
      if (node.content.kind === "message" && node.content.next === removedId) {
        return { ...node, content: { ...node.content, next: null } };
      }
      if (node.content.kind === "list") {
        return { ...node, content: { ...node.content, options: node.content.options.map((option) => (option.next === removedId ? { ...option, next: null } : option)) } };
      }
      return node;
    });
  }

  async function submitNode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = nodeTitle.trim() || nodeType;
    const content = draftContent.kind === "list" ? { ...draftContent, options: draftContent.options.filter((option) => option.label.trim()) } : draftContent;
    if (content.kind === "message" && !content.text.trim()) return;
    if (content.kind === "list" && !content.text.trim()) return;
    if (content.kind === "team" && !content.teamName.trim() && teams.length) return;
    if (content.kind === "employee" && !content.employeeName.trim() && employees.length) return;

    let nextNodes: BotNode[];
    if (editingNodeId) {
      nextNodes = nodes.map((node) => (node.id === editingNodeId ? { ...node, type: nodeType, title, content } : node));
    } else {
      const maxX = nodes.length ? Math.max(...nodes.map((node) => node.x)) : START_POSITION.x + 320 - 320;
      nextNodes = [
        ...nodes,
        { id: `local-${Date.now()}`, type: nodeType, title, content, x: maxX + 320, y: START_POSITION.y }
      ];
    }
    setNodes(nextNodes);
    setBuilderOpen(false);
    await persistNodes(nextNodes);
  }

  async function removeNode(id: string) {
    const nextNodes = pruneLinksTo(nodes.filter((node) => node.id !== id), id);
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

  function canvasPoint(clientX: number, clientY: number) {
    // Node x/y (and every drop-target hit test) are relative to
    // .bot-flow-surface's own origin, not .bot-canvas's - the canvas also
    // contains the toolbar hint text above the surface, so anchoring on the
    // canvas's rect silently added that toolbar's height as a vertical
    // offset to every connector drag, making drops land below wherever the
    // cursor actually was. The surface's rect already reflects the current
    // scroll position, so no separate scrollLeft/scrollTop math is needed.
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  function handleConnectorPointerDown(event: ReactPointerEvent<HTMLButtonElement>, nodeId: string, optionId: string | null) {
    event.stopPropagation();
    event.preventDefault();
    // Deliberately no setPointerCapture here: capturing on the dot would
    // route every subsequent move/up event to the dot itself instead of
    // letting them bubble to the canvas's handlers, which is what actually
    // tracks the draft line and resolves the drop target.
    const point = canvasPoint(event.clientX, event.clientY);
    setConnectingFrom({ nodeId, optionId, x: point.x, y: point.y });
    setDragPoint(point);
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!connectingFrom) return;
    setDragPoint(canvasPoint(event.clientX, event.clientY));
  }

  async function handleCanvasPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!connectingFrom) return;
    const drop = canvasPoint(event.clientX, event.clientY);
    const source = connectingFrom;
    setConnectingFrom(null);
    setDragPoint(null);

    const targetNode = nodes.find((node) => {
      if (node.id === source.nodeId) return false;
      return drop.x >= node.x && drop.x <= node.x + NODE_WIDTH && drop.y >= node.y && drop.y <= node.y + nodeBoxHeight(node);
    });
    if (!targetNode) return;

    const nextNodes = nodes.map((node) => {
      if (node.id !== source.nodeId) return node;
      if (source.optionId && node.content.kind === "list") {
        return { ...node, content: { ...node.content, options: node.content.options.map((option) => (option.id === source.optionId ? { ...option, next: targetNode.id } : option)) } };
      }
      if (!source.optionId && node.content.kind === "message") {
        return { ...node, content: { ...node.content, next: targetNode.id } };
      }
      return node;
    });
    setNodes(nextNodes);
    await persistNodes(nextNodes, nodes);
  }

  function nodeBoxHeight(node: BotNode) {
    if (node.content.kind === "list") return 56 + node.content.options.length * OPTION_ROW_HEIGHT + 10;
    return NODE_HEIGHT;
  }

  const channelLabel = t(channels.find((item) => item.id === channel)?.label || "", channelLabelsEn[channel] || "");
  const edges = useMemo(() => {
    const list: Array<{ from: string; to: string; fromY: number; fromX: number }> = [];
    if (nodes[0]) list.push({ from: "start", to: nodes[0].id, fromX: START_POSITION.x + NODE_WIDTH, fromY: START_POSITION.y + 28 });
    for (const node of nodes) {
      for (const link of outgoingLinks(node)) {
        const anchor = connectorAnchors(node).find((item) => item.key === link.from);
        list.push({ from: link.from, to: link.to, fromX: anchor?.x ?? node.x + NODE_WIDTH, fromY: anchor?.y ?? node.y + 28 });
      }
    }
    return list;
  }, [nodes]);
  const canvasSize = useMemo(() => {
    const maxX = nodes.reduce((max, node) => Math.max(max, node.x + NODE_WIDTH + 60), START_POSITION.x + 420);
    const maxY = nodes.reduce((max, node) => Math.max(max, node.y + nodeBoxHeight(node) + 60), START_POSITION.y + 260);
    return { width: maxX, height: maxY };
  }, [nodes]);

  function nodeTargetPoint(id: string) {
    if (id === "start") return { x: START_POSITION.x, y: START_POSITION.y + 28 };
    const node = nodes.find((item) => item.id === id);
    return node ? { x: node.x, y: node.y + Math.min(28, nodeBoxHeight(node) / 2) } : { x: 0, y: 0 };
  }

  return (
    <section className="page-stack">
      <div className="page-hero">
        <div>
          <h1>{t("الرد الآلي", "Auto Reply")}</h1>
          <p>{t(
            'أنشئ روبوت محادثة يرحب بالعميل من أول رسالة، يعرض له الخيارات المناسبة، يرسل ردوداً جاهزة، ويحوّل المحادثة للفريق الصحيح عند الحاجة. اسحب أي خطوة لتحريكها، أو اضغط عليها لتعديلها. لربط خطوة بخطوة ثانية، اسحب من النقطة الصغيرة يمين الخطوة (أو يمين كل خيار بقائمة) لأي خطوة ثانية تبي تنتقل لها — بدون كتابة أي أسماء.',
            'Create a chatbot that welcomes the customer from the first message, shows them the right options, sends ready-made replies, and transfers the conversation to the right team when needed. Drag any step to move it, or click it to edit it. To link one step to another, drag from the small dot on the right of the step (or on the right of each list option) to any other step - no typing names.'
          )}</p>
        </div>
        <div className="bot-hero-actions">
          <label className="bot-toggle">
            <input type="checkbox" checked={enabled} onChange={toggleEnabled} disabled={loading} />
            <span>{enabled ? t(`الرد الآلي مفعّل (${channelLabel})`, `Auto reply enabled (${channelLabel})`) : t(`الرد الآلي متوقف (${channelLabel})`, `Auto reply disabled (${channelLabel})`)}</span>
          </label>
          <button className="btn soft" type="button" onClick={openAddModal}>＋ {t("خطوة مخصصة", "Custom step")}</button>
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

      {feedback ? <p className={`bot-feedback ${feedback.type}`} role="status">{feedback.message}</p> : null}

      <div className="bot-workspace">
        <aside className="bot-step-library">
          <div className="bot-library-head">
            <div>
              <span>{t("مكتبة جاهزة", "Ready library")}</span>
              <h2>{t("اسحب الخطوة وأفلتها", "Drag and drop a step")}</h2>
            </div>
            <small>{t("أفلتها في أي مكان داخل المخطط، أو اضغط (+) لإضافتها مباشرة.", "Drop it anywhere on the canvas, or click (+) to add it directly.")}</small>
          </div>
          <div className="bot-library-filters" role="group" aria-label={t("تصفية الخطوات", "Filter steps")}>
            {([
              ["all", t("الكل", "All")],
              ["step", t("خطوات", "Steps")],
              ["flow", t("مسارات كاملة", "Full flows")]
            ] as const).map(([value, label]) => (
              <button key={value} type="button" className={libraryFilter === value ? "active" : ""} onClick={() => setLibraryFilter(value)}>{label}</button>
            ))}
          </div>
          <div className="bot-library-list">
            {visibleReadySteps.map((item) => (
              <article
                className={`bot-library-card ${item.kind === "flow" ? "flow" : ""}`}
                draggable={!saving}
                key={item.id}
                onDragStart={(event) => startLibraryDrag(event, item)}
                onDragEnd={() => setDraggedLibraryId(null)}
              >
                <span className="bot-library-icon" aria-hidden="true">{item.icon}</span>
                <div>
                  <b>{item.title}</b>
                  <small>{item.description}</small>
                  {item.kind === "flow" ? <em>{t(`${item.nodes.length} خطوات مترابطة`, `${item.nodes.length} linked steps`)}</em> : <em>{nodeTypeLabel(item.nodes[0].type, t)}</em>}
                </div>
                <button type="button" disabled={saving} onClick={() => void insertReadyStep(item)} aria-label={t(`إضافة ${item.title}`, `Add ${item.title}`)}>＋</button>
              </article>
            ))}
          </div>
        </aside>

      <div
        className={`bot-canvas ${draggedLibraryId ? "library-dragging" : ""}`}
        ref={canvasRef}
        dir="ltr"
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
        onDrop={(event) => void handleLibraryDrop(event)}
      >
        <div className="bot-toolbar" dir="auto"><b>{t(`مخطط الرد الآلي (${channelLabel})`, `Auto reply flow (${channelLabel})`)}</b><span>{t('اسحب من النقطة يمين أي خطوة لخطوة ثانية عشان تربطهم', 'Drag from the dot on the right of a step to another step to link them')}</span></div>
        <div className="bot-flow-surface" ref={surfaceRef} style={{ width: canvasSize.width, height: canvasSize.height }}>
          <svg className="bot-flow-edges" width={canvasSize.width} height={canvasSize.height}>
            <defs>
              <marker id="botArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="bot-flow-arrowhead" />
              </marker>
            </defs>
            {edges.map((edge) => {
              const to = nodeTargetPoint(edge.to);
              const midX = (edge.fromX + to.x) / 2;
              return (
                <path
                  key={`${edge.from}-${edge.to}`}
                  d={`M ${edge.fromX} ${edge.fromY} C ${midX} ${edge.fromY}, ${midX} ${to.y}, ${to.x} ${to.y}`}
                  fill="none"
                  markerEnd="url(#botArrow)"
                />
              );
            })}
            {connectingFrom && dragPoint ? (
              <path
                className="bot-flow-edge-draft"
                d={`M ${connectingFrom.x} ${connectingFrom.y} L ${dragPoint.x} ${dragPoint.y}`}
                fill="none"
              />
            ) : null}
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
              {node.content.kind === "message" ? <small>{node.content.text}</small> : null}
              {node.content.kind === "close" ? <small>{node.content.text || t("(بدون رسالة إغلاق)", "(no closing message)")}</small> : null}
              {node.content.kind === "team" ? <small>{node.content.teamName || t("لم يُحدد فريق", "No team chosen")}</small> : null}
              {node.content.kind === "employee" ? <small>{node.content.employeeName || t("لم يُحدد موظف", "No employee chosen")}</small> : null}
              {node.content.kind === "message" ? (
                <button
                  className={`bot-connector ${node.content.next ? "linked" : ""}`}
                  type="button"
                  aria-label={t("اسحب للربط بخطوة ثانية", "Drag to link to another step")}
                  onPointerDown={(event) => handleConnectorPointerDown(event, node.id, null)}
                />
              ) : null}
              {node.content.kind === "list" ? (
                <ul className="bot-node-options">
                  {node.content.options.map((option) => (
                    <li key={option.id}>
                      <span>{option.label || t("(بدون نص)", "(no text)")}</span>
                      <button
                        className={`bot-connector ${option.next ? "linked" : ""}`}
                        type="button"
                        aria-label={t("اسحب للربط بخطوة ثانية", "Drag to link to another step")}
                        onPointerDown={(event) => handleConnectorPointerDown(event, node.id, option.id)}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}

          {!loading && !nodes.length ? (
            <div className="bot-node reply bot-flow-node" style={{ left: START_POSITION.x + 320, top: START_POSITION.y, width: NODE_WIDTH }} dir="auto">
              <b>{t("لا توجد خطوات بعد", "No steps yet")}</b>
              <small>{t('اضغط "إضافة خطوة" لإنشاء أول خطوة في الرد الآلي.', 'Click "Add step" to create the first step in the auto reply.')}</small>
            </div>
          ) : null}
        </div>
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
                      onChange={changeNodeType}
                      options={nodeTypes.map((type) => ({ value: type, label: nodeTypeLabel(type, t) }))}
                    />
                  </label>
                  <label>
                    <span>{t("اسم الخطوة (يظهر على المخطط فقط)", "Step name (shown on the diagram only)")}</span>
                    <input value={nodeTitle} onChange={(event) => setNodeTitle(event.target.value)} placeholder={t("مثال: ترحيب أولي", "Example: initial welcome")} />
                  </label>
                </div>

                {draftContent.kind === "message" ? (
                  <label>
                    <span>{t("نص الرسالة (يظهر للعميل)", "Message text (shown to the customer)")}</span>
                    <textarea
                      value={draftContent.text}
                      onChange={(event) => setDraftContent({ kind: "message", next: draftContent.next, text: event.target.value })}
                      placeholder={t("اكتب الرسالة التي ستُرسل للعميل", "Write the message that will be sent to the customer")}
                      rows={4}
                      required
                    />
                  </label>
                ) : null}

                {draftContent.kind === "close" ? (
                  <label>
                    <span>{t("رسالة الإغلاق (اختياري)", "Closing message (optional)")}</span>
                    <textarea
                      value={draftContent.text}
                      onChange={(event) => setDraftContent({ kind: "close", text: event.target.value })}
                      placeholder={t("مثال: شكرًا لتواصلك معنا", "Example: Thanks for reaching out")}
                      rows={3}
                    />
                  </label>
                ) : null}

                {draftContent.kind === "team" ? (
                  <label>
                    <span>{t("الفريق", "Team")}</span>
                    {teams.length ? (
                      <CustomSelect
                        value={draftContent.teamName}
                        onChange={(value) => setDraftContent({ kind: "team", teamName: value })}
                        options={teams.map((team) => ({ value: team.name, label: team.name }))}
                        placeholder={t("اختر فريق", "Choose a team")}
                      />
                    ) : (
                      <p className="muted-copy">{t("ما فيه فرق منشأة بعد. أنشئ فريق أولاً من صفحة الفرق.", "No teams created yet. Create a team first from the Teams page.")}</p>
                    )}
                  </label>
                ) : null}

                {draftContent.kind === "employee" ? (
                  <label>
                    <span>{t("الموظف", "Employee")}</span>
                    {employees.length ? (
                      <CustomSelect
                        value={draftContent.employeeName}
                        onChange={(value) => setDraftContent({ kind: "employee", employeeName: value })}
                        options={employees.map((employee) => ({ value: employee.name, label: employee.name }))}
                        placeholder={t("اختر موظف", "Choose an employee")}
                      />
                    ) : (
                      <p className="muted-copy">{t("ما فيه موظفين مضافين بعد. أضف موظف أولاً من صفحة الموظفين.", "No employees added yet. Add an employee first from the Employees page.")}</p>
                    )}
                  </label>
                ) : null}

                {draftContent.kind === "list" ? (
                  <>
                    <label>
                      <span>{t("السؤال أو الرسالة (يظهر للعميل)", "Question or message (shown to the customer)")}</span>
                      <textarea
                        value={draftContent.text}
                        onChange={(event) => setDraftContent({ ...draftContent, text: event.target.value })}
                        placeholder={t("مثال: كيف نقدر نساعدك؟", "Example: How can we help you?")}
                        rows={2}
                        required
                      />
                    </label>
                    <label>
                      <span>{t("الخيارات", "Options")}</span>
                      <div className="bot-option-editor">
                        {draftContent.options.map((option, index) => (
                          <div className="bot-option-editor-row" key={option.id}>
                            <input
                              value={option.label}
                              onChange={(event) => {
                                const options = draftContent.options.map((item) => (item.id === option.id ? { ...item, label: event.target.value } : item));
                                setDraftContent({ ...draftContent, options });
                              }}
                              placeholder={t(`الخيار ${index + 1}`, `Option ${index + 1}`)}
                            />
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label={t("حذف الخيار", "Remove option")}
                              onClick={() => setDraftContent({ ...draftContent, options: draftContent.options.filter((item) => item.id !== option.id) })}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="btn soft"
                          onClick={() => setDraftContent({ ...draftContent, options: [...draftContent.options, { id: crypto.randomUUID(), label: "", next: null }] })}
                        >
                          ＋ {t("إضافة خيار", "Add option")}
                        </button>
                      </div>
                      <small className="field-hint">{t("بعد الحفظ، اسحب من النقطة يمين كل خيار بالمخطط للخطوة اللي يتفرّع لها.", "After saving, drag from the dot next to each option on the diagram to the step it should branch to.")}</small>
                    </label>
                  </>
                ) : null}

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
