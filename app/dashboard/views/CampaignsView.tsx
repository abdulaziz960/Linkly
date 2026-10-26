"use client";

import { formatNumber } from "../../../lib/format";
import { confirmDialog, notify } from "../../../lib/ui-dialogs";

import { FormEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import type { Campaign, MessageTemplate, Segment } from "../types";
import { useLanguage } from "../i18n";
import NumbersReport, { type NumbersReportData } from "../components/NumbersReport";
import { analyzePastedNumbers } from "../../../lib/phone-validation";
import CustomSelect from "../../components/CustomSelect";
import { formatDateTime, formatFullDateTime, formatRelativeTime, parseStoredDate } from "../../../lib/time";
import { buildCsv } from "../../../lib/csv-export";
import { useUnsavedChanges } from "../use-unsaved-changes";
import CampaignEngagementReport from "../components/CampaignEngagementReport";
import { firstChar } from "../../../lib/first-char";
import { computeCampaignStats, formatRate, sumCampaignStats, type CampaignStats, type FailureReasonKey } from "../../../lib/campaign-metrics";

type KpiFilter = "all" | "sent" | "pending" | "completed" | "active";

const failureReasonLabels: Record<FailureReasonKey, [string, string]> = {
  unregistered: ["تعذّر التسليم (رقم غير مسجّل أو غير مفعّل)", "Undeliverable (number not on WhatsApp or inactive)"],
  rejected: ["رسالة مرفوضة", "Message rejected"],
  outside_window: ["خارج نافذة 24 ساعة", "Outside the 24-hour window"],
  insufficient_balance: ["رصيد غير كافٍ", "Insufficient balance"],
  meta_limit: ["واتساب منع الإرسال لهذا العميل (حد رسائل التسويق)", "WhatsApp held the message back (marketing-message limit)"],
  recipient_blocked: ["العميل أوقف رسائل الأعمال", "Customer turned off business messages"],
  other: ["أسباب أخرى", "Other reasons"]
};

/** Stats of a campaign, or the best that can be said from its stored counters when the server sent none. */
function statsOf(campaign: Campaign): CampaignStats {
  return campaign.stats ?? computeCampaignStats({
    total: campaign.total,
    statusCounts: [{ status: "تم الإرسال", count: campaign.sent }, { status: "قيد الإرسال", count: Math.max(0, campaign.total - campaign.sent) }]
  });
}

/** The moment a campaign is "about": when it started sending, else when it is due, else its last change. */
function campaignWhen(campaign: Campaign): Date | null {
  return parseStoredDate(campaign.sentAt) ?? parseStoredDate(campaign.scheduledAt) ?? parseStoredDate(campaign.updatedAt);
}

const channelLabels: Record<string, [string, string]> = { whatsapp: ["واتساب", "WhatsApp"], instagram: ["إنستغرام", "Instagram"], facebook: ["فيسبوك", "Facebook"], telegram: ["تيليجرام", "Telegram"] };

/** A time as "قبل ساعتين" with the full date in the tooltip (older than a month: the date itself). */
function DateCell({ value, language, empty = "—" }: { value: Date | null; language: "ar" | "en"; empty?: string }) {
  const [now] = useState(() => Date.now());
  if (!value) return <span className="campaign-date">{empty}</span>;
  const full = formatFullDateTime(value, language);
  const recent = Math.abs(now - value.getTime()) < 30 * 24 * 60 * 60 * 1000;
  return <time className="campaign-date" dateTime={value.toISOString()} title={full}>{recent ? formatRelativeTime(value, language, now) : full}</time>;
}

function downloadTextFile(fileName: string, text: string) {
  const blob = new Blob([`\ufeff${text}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

type RowMenuItem = { key: string; label: string; onSelect: () => void; danger?: boolean; hidden?: boolean };

/**
 * The "⋯" menu of a table row. The list is drawn on the page itself (a portal, positioned from the button) rather than
 * inside the table's scrolling box, so a table with one row cannot cut it off. It opens upward when there is no room
 * below, closes on Escape, on an outside click, on scroll or resize, and returns focus to its button.
 */
function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; dir: "rtl" | "ltr" } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const visible = items.filter((item) => !item.hidden);

  useEffect(() => {
    if (!open) return;
    function close() { setOpen(false); }
    function onDown(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || listRef.current?.contains(target)) return;
      close();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { close(); buttonRef.current?.focus(); }
    }
    // Scrolling the box the button sits in moves the button away from the list, so the list closes; a scroll
    // elsewhere (and the browser settling the page right after opening) leaves it be.
    const openedAt = Date.now();
    function onScroll(event: Event) {
      if (Date.now() - openedAt < 250) return;
      const target = event.target;
      if (target === document || (target instanceof Node && target.contains(buttonRef.current))) close();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  // Placed after the list has been measured: right edge under the button's right edge, flipped upward at the screen's end.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !listRef.current) return;
    const button = buttonRef.current.getBoundingClientRect();
    const list = listRef.current.getBoundingClientRect();
    const margin = 8;
    const below = button.bottom + 4;
    const top = below + list.height + margin > window.innerHeight ? Math.max(margin, button.top - list.height - 4) : below;
    const rtl = getComputedStyle(buttonRef.current).direction === "rtl";
    const preferred = rtl ? button.right - list.width : button.left;
    const left = Math.min(Math.max(margin, preferred), Math.max(margin, window.innerWidth - list.width - margin));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPosition({ top, left, dir: rtl ? "rtl" : "ltr" });
  }, [open]);

  return (
    <div className="row-menu">
      <button ref={buttonRef} className="row-menu-trigger" type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => { setPosition(null); setOpen((current) => !current); }}>⋯</button>
      {open && typeof document !== "undefined"
        ? createPortal(
          <div
            ref={listRef}
            className="row-menu-list"
            role="menu"
            aria-label={label}
            dir={position?.dir}
            style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? "visible" : "hidden" }}
          >
            {visible.map((item) => (
              <button key={item.key} type="button" role="menuitem" className={item.danger ? "danger" : ""} onClick={() => { setOpen(false); item.onSelect(); }}>{item.label}</button>
            ))}
          </div>,
          document.body
        )
        : null}
    </div>
  );
}

const pageSizeOptions = [
  { value: "10", label: "10" },
  { value: "25", label: "25" },
  { value: "50", label: "50" }
];

type CampaignForm = {
  id?: string;
  name: string;
  channel: string;
  templateName: string;
  fileName: string;
  scheduled: boolean;
  scheduledAt: string;
  recurring: boolean;
  recurrenceIntervalDays: number;
  recurrenceEndAt: string;
  audienceMode: "file" | "segment" | "paste";
  segmentId: string;
  linkTrackingEnabled: boolean;
  destinationUrl: string;
  description: string;
  tags: string;
};

type CampaignRecurrenceSummary = {
  id: string;
  name: string;
  intervalDays: number;
  nextRunAt: string;
  endAt: string;
  occurrences: number;
  status: string;
};

const recurrenceIntervalOptions: Array<{ days: number; ar: string; en: string }> = [
  { days: 1, ar: "يوميًا", en: "Daily" },
  { days: 7, ar: "أسبوعيًا", en: "Weekly" },
  { days: 14, ar: "كل أسبوعين", en: "Every 2 weeks" },
  { days: 30, ar: "شهريًا", en: "Monthly" }
];

type PricingTier = {
  range: string;
  min: number;
  max: number;
  rate: number;
};

type BalanceTransaction = {
  id: string;
  balance: number;
  usage: string;
  date: string;
  status: string;
  cost?: number;
};

const marketingMessagePrices: PricingTier[] = [
  { range: "1 إلى 999", min: 1, max: 999, rate: 0.032 },
  { range: "1k إلى 5k", min: 1000, max: 5000, rate: 0.03 },
  { range: "5k إلى 10k", min: 5001, max: 10000, rate: 0.028 },
  { range: "10k إلى 25k", min: 10001, max: 25000, rate: 0.026 },
  { range: "25k إلى 50k", min: 25001, max: 50000, rate: 0.023 },
  { range: "50k إلى 100k", min: 50001, max: 100000, rate: 0.02 },
  { range: "100k إلى 150k", min: 100001, max: 150000, rate: 0.018 },
  { range: "150k إلى 250k", min: 150001, max: 250000, rate: 0.016 },
  { range: "250k إلى 500k", min: 250001, max: 500000, rate: 0.014 },
  { range: "500k إلى 1m", min: 500001, max: 1000000, rate: 0.012 }
];

function pricingRangeLabel(range: string, language: string) {
  if (language !== "en") return range;
  return range.replace("إلى", "to");
}

function campaignStatusLabel(status: string, t: (ar: string, en: string) => string) {
  if (status === "الحملة أنجزت") return t("الحملة أنجزت", "Completed");
  if (status === "قيد الإرسال") return t("قيد الإرسال", "Sending");
  if (status === "مجدولة") return t("مجدولة", "Scheduled");
  if (status === "ملغاة") return t("ملغاة", "Cancelled");
  if (status === "مؤرشفة") return t("مؤرشفة", "Archived");
  return status;
}

function transactionStatusLabel(status: string, t: (ar: string, en: string) => string) {
  if (status === "مكتمل") return t("مكتمل", "Completed");
  if (status === "قيد الانتظار") return t("قيد الانتظار", "Pending");
  if (status === "فشل") return t("فشل", "Failed");
  return status;
}

const reportIcon = <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>;
const copyIcon = <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>;
const archiveIcon = <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4" /></svg>;

export default function CampaignsView({
  campaigns,
  templates,
  whatsappConnected,
  brandName,
  hubTabs,
  onRefreshData
}: {
  campaigns: Campaign[];
  templates: MessageTemplate[];
  whatsappConnected: boolean;
  brandName: string;
  hubTabs?: ReactNode;
  onRefreshData: () => Promise<void>;
}) {
  const { t, language } = useLanguage();
  const approvedTemplates = useMemo(
    () => !whatsappConnected ? [] : templates.filter((template) => (
      template.status === "معتمد" &&
      template.type !== "خدمة" &&
      (template.category === "MARKETING" || template.type === "تسويق")
    )),
    [templates, whatsappConnected]
  );
  const defaultTemplateName = approvedTemplates[0]?.name || "";
  const emptyForm = useMemo<CampaignForm>(
    () => ({
      name: "",
      channel: "واتساب",
      templateName: defaultTemplateName,
      fileName: "",
      scheduled: false,
      scheduledAt: "",
      recurring: false,
      recurrenceIntervalDays: 7,
      recurrenceEndAt: "",
      audienceMode: "file",
      segmentId: "",
      linkTrackingEnabled: false,
      destinationUrl: "",
      description: "",
      tags: ""
    }),
    [defaultTemplateName]
  );
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CampaignForm>(emptyForm);
  const [recurrences, setRecurrences] = useState<CampaignRecurrenceSummary[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [campaignFile, setCampaignFile] = useState<File | null>(null);
  const [headerMediaFile, setHeaderMediaFile] = useState<File | null>(null);
  const { confirmClose: confirmCloseForm } = useUnsavedChanges(formOpen, { form, file: campaignFile?.name ?? "", media: headerMediaFile?.name ?? "" }, t);
  async function requestCloseForm() {
    if (await confirmCloseForm()) setFormOpen(false);
  }
  const [brokenThumbIds, setBrokenThumbIds] = useState<Set<string>>(new Set());
  const selectedTemplate = approvedTemplates.find((template) => template.name === form.templateName);
  const needsHeaderMedia = Boolean(selectedTemplate && ["IMAGE", "VIDEO"].includes(selectedTemplate.headerType || "NONE"));
  const templateHasSavedMedia = Boolean(selectedTemplate?.hasHeaderMediaSaved);
  const [recipientPreview, setRecipientPreview] = useState<number | null>(null);
  const [numbersReport, setNumbersReport] = useState<NumbersReportData | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [recipientPreviewLoading, setRecipientPreviewLoading] = useState(false);
  const [recipientPreviewError, setRecipientPreviewError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"campaigns" | "balance">("campaigns");
  const [reportCampaign, setReportCampaign] = useState<Campaign | null>(null);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeMessages, setChargeMessages] = useState("5000");
  const [chargeError, setChargeError] = useState("");
  const [chargeSubmitting, setChargeSubmitting] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [balance, setBalance] = useState(0);
  const [lastTopUpAmount, setLastTopUpAmount] = useState(0);
  const [balanceTransactions, setBalanceTransactions] = useState<BalanceTransaction[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceLoadError, setBalanceLoadError] = useState("");
  const [campaignSearch, setCampaignSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [campaignStatusFilter, setCampaignStatusFilter] = useState("all");
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [refreshState, setRefreshState] = useState<"idle" | "loading" | "error">("idle");
  const [rescheduling, setRescheduling] = useState<Campaign | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [rescheduleError, setRescheduleError] = useState("");
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [campaignSort, setCampaignSort] = useState("latest");
  const [campaignPageSize, setCampaignPageSize] = useState("10");
  const [campaignPage, setCampaignPage] = useState(1);
  const [balanceSearch, setBalanceSearch] = useState("");
  const [balancePageSize, setBalancePageSize] = useState("10");
  const [balancePage, setBalancePage] = useState(1);

  const parsedChargeMessages = Math.max(0, Number(chargeMessages.replace(/[^\d]/g, "")) || 0);
  const chargeTier = findMarketingMessageTier(parsedChargeMessages);
  const chargeTotal = chargeTier ? parsedChargeMessages * chargeTier.rate : 0;

  async function loadBalance() {
    setBalanceLoading(true);
    setBalanceLoadError("");
    try {
      const response = await fetch("/api/campaigns/balance");
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        setBalanceLoadError(body?.error || t(`تعذر تحميل الرصيد (${response.status})`, `Could not load the balance (${response.status})`));
      } else {
        setBalance(body.data?.balance ?? 0);
        setLastTopUpAmount(body.data?.lastTopUpAmount ?? 0);
        setBalanceTransactions(body.data?.transactions ?? []);
      }
    } catch {
      setBalanceLoadError(t("تعذر الاتصال بالسيرفر لتحميل الرصيد", "Could not reach the server to load the balance"));
    }
    setBalanceLoading(false);
  }

  // Loaded as soon as the page opens (the balance is also needed for the warnings), and again on the balance tab.
  useEffect(() => {
    loadBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === "balance") loadBalance();
  }, [activeTab]);

  async function loadRecurrences() {
    try {
      const response = await fetch("/api/campaigns/recurring");
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok) setRecurrences(body.data ?? []);
    } catch {
      // Non-critical - the compact recurring-series list simply stays empty on failure.
    }
  }

  useEffect(() => {
    if (activeTab === "campaigns") loadRecurrences();
  }, [activeTab]);

  async function loadSegments() {
    try {
      const response = await fetch("/api/segments");
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok) setSegments(body.data ?? []);
    } catch {
      // Non-critical - the segment picker simply stays empty on failure.
    }
  }

  useEffect(() => {
    if (formOpen) loadSegments();
  }, [formOpen]);

  async function toggleRecurrence(id: string, nextStatus: "نشطة" | "متوقفة") {
    await fetch(`/api/campaigns/recurring/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus })
    });
    await loadRecurrences();
  }

  const filteredCampaigns = useMemo(() => {
    const query = campaignSearch.trim().toLowerCase();
    const matchesKpi = (campaign: Campaign) => {
      if (kpiFilter === "sent") return campaign.sent > 0;
      if (kpiFilter === "pending") return statsOf(campaign).pending > 0;
      if (kpiFilter === "completed") return campaign.status === "الحملة أنجزت";
      if (kpiFilter === "active") return campaign.status === "قيد الإرسال" || campaign.status === "مجدولة";
      return true;
    };
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00+03:00`).getTime() : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59+03:00`).getTime() : null;
    const inRange = (campaign: Campaign) => {
      if (from === null && to === null) return true;
      const when = campaignWhen(campaign)?.getTime();
      if (when === undefined) return false;
      return (from === null || when >= from) && (to === null || when <= to);
    };
    const rows = campaigns.filter((campaign) => (
      matchesKpi(campaign) &&
      inRange(campaign) &&
      (channelFilter === "all" || (campaign.channel || "whatsapp") === channelFilter) &&
      (templateFilter === "all" || campaign.templateName === templateFilter) &&
      // Archived campaigns stay out of the way unless the status filter asks for them.
      (campaignStatusFilter === "مؤرشفة" ? campaign.status === "مؤرشفة" : campaign.status !== "مؤرشفة" && (campaignStatusFilter === "all" || campaign.status === campaignStatusFilter)) &&
      (!query || campaign.name.toLowerCase().includes(query) || campaign.status.toLowerCase().includes(query) || campaign.updatedAt.toLowerCase().includes(query) || `${campaign.sent}/${campaign.total}`.includes(query))
    ));
    if (campaignSort === "name") return [...rows].sort((a, b) => a.name.localeCompare(b.name));
    if (campaignSort === "sent") return [...rows].sort((a, b) => b.sent - a.sent);
    if (campaignSort === "progress") return [...rows].sort((a, b) => Number.parseFloat(b.progress) - Number.parseFloat(a.progress));
    return [...rows].sort((a, b) => (campaignWhen(b)?.getTime() ?? 0) - (campaignWhen(a)?.getTime() ?? 0));
  }, [campaignSearch, campaignSort, campaignStatusFilter, kpiFilter, dateFrom, dateTo, channelFilter, templateFilter, campaigns]);
  // Scheduled campaigns that have a send time, soonest first.
  const upcomingCampaigns = useMemo(
    () => campaigns
      .filter((campaign) => campaign.status === "مجدولة" && parseStoredDate(campaign.scheduledAt))
      .sort((a, b) => (parseStoredDate(a.scheduledAt)?.getTime() ?? 0) - (parseStoredDate(b.scheduledAt)?.getTime() ?? 0)),
    [campaigns]
  );
  // Messages that still have to go out from campaigns that are sending or scheduled, against what the balance covers.
  const queuedMessages = useMemo(
    // A scheduled campaign without a send time is a saved draft, not something waiting for the balance.
    () => campaigns.filter((campaign) => campaign.status === "قيد الإرسال" || (campaign.status === "مجدولة" && parseStoredDate(campaign.scheduledAt))).reduce((sum, campaign) => sum + statsOf(campaign).pending, 0),
    [campaigns]
  );
  const marketingTemplates = useMemo(() => templates.filter((template) => template.type !== "خدمة" && (template.category === "MARKETING" || template.type === "تسويق")), [templates]);
  const rejectedTemplates = marketingTemplates.filter((template) => template.status === "مرفوض");
  const reviewTemplates = marketingTemplates.filter((template) => template.status === "قيد المراجعة");
  const templateOptions = useMemo(() => [...new Set(campaigns.map((campaign) => campaign.templateName).filter((name): name is string => Boolean(name)))], [campaigns]);
  const channelOptions = useMemo(() => [...new Set(campaigns.map((campaign) => campaign.channel || "whatsapp"))], [campaigns]);
  const campaignPagination = paginate(filteredCampaigns, campaignPage, Number(campaignPageSize));
  const filteredBalanceTransactions = useMemo(() => {
    const query = balanceSearch.trim().toLowerCase();
    if (!query) return balanceTransactions;
    return balanceTransactions.filter((item) => (
      item.id.toLowerCase().includes(query) ||
      item.usage.toLowerCase().includes(query) ||
      item.status.toLowerCase().includes(query) ||
      item.date.toLowerCase().includes(query) ||
      String(item.balance).includes(query)
    ));
  }, [balanceSearch, balanceTransactions]);
  const balancePagination = paginate(filteredBalanceTransactions, balancePage, Number(balancePageSize));
  const campaignOverview = useMemo(() => {
    const totals = sumCampaignStats(campaigns.map(statsOf));
    return {
      totals,
      recipients: totals.total,
      sent: totals.sent,
      // Only recipients really waiting in the queue: failed and opted-out ones are not "pending".
      remaining: totals.pending,
      sendRate: totals.sendRate,
      completed: campaigns.filter((campaign) => campaign.status === "الحملة أنجزت").length,
      active: campaigns.filter((campaign) => campaign.status === "قيد الإرسال" || campaign.status === "مجدولة").length
    };
  }, [campaigns]);

  function applyPeriod(value: string) {
    setPeriodFilter(value);
    setCampaignPage(1);
    const now = new Date();
    const iso = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (value === "all") { setDateFrom(""); setDateTo(""); return; }
    const from = new Date(now);
    if (value === "week") from.setDate(from.getDate() - 6);
    if (value === "month") from.setDate(1);
    if (value === "year") { from.setMonth(0); from.setDate(1); }
    setDateFrom(iso(from));
    setDateTo(iso(now));
  }

  async function handleCampaignFileChange(file: File | null) {
    setCampaignFile(file);
    setNumbersReport(null);
    setRecipientPreview(null);
    setRecipientPreviewError("");
    if (!file) return;

    setRecipientPreviewLoading(true);
    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/campaigns/preview-recipients", { method: "POST", body });
    const payload = await response.json().catch(() => null);
    setRecipientPreviewLoading(false);

    if (!response.ok || !payload?.ok) {
      setRecipientPreviewError(payload?.error || t("تعذر قراءة الملف", "Unable to read the file"));
      return;
    }
    setRecipientPreview(payload.data?.count ?? 0);
    setNumbersReport({ count: payload.data?.count ?? 0, totalRows: payload.data?.totalRows ?? 0, duplicates: payload.data?.duplicates ?? 0, rejected: payload.data?.rejected ?? [], rejectedCount: payload.data?.rejectedCount ?? 0 });
  }

  function handlePastedChange(text: string) {
    setPastedText(text);
    if (!text.trim()) { setNumbersReport(null); setRecipientPreview(null); return; }
    const analysis = analyzePastedNumbers(text);
    setNumbersReport({ count: analysis.valid.length, totalRows: analysis.totalRows, duplicates: analysis.duplicates, rejected: analysis.rejected.slice(0, 300), rejectedCount: analysis.rejected.length });
    setRecipientPreview(analysis.valid.length);
  }

  function openForm(campaign?: Campaign) {
    setFormError("");
    setCampaignFile(null);
    setPastedText("");
    setNumbersReport(null);
    setHeaderMediaFile(null);
    setRecipientPreview(campaign?.total ?? null);
    setRecipientPreviewError("");
    setForm(
      campaign
        ? {
            id: campaign.id,
            name: campaign.name,
            channel: "واتساب",
            templateName: defaultTemplateName,
            fileName: "",
            scheduled: false,
            scheduledAt: "",
            recurring: false,
            recurrenceIntervalDays: 7,
            recurrenceEndAt: "",
            audienceMode: "file",
            segmentId: "",
            linkTrackingEnabled: false,
            destinationUrl: "",
            description: campaign.description ?? "",
            tags: (campaign.tags ?? []).join(", ")
          }
        : emptyForm
    );
    setFormOpen(true);
  }

  function selectSegment(segmentId: string) {
    setForm((current) => ({ ...current, segmentId }));
    const segment = segments.find((item) => item.id === segmentId);
    setRecipientPreviewError("");
    setRecipientPreview(segment ? segment.recipientCount : null);
  }

  function setAudienceMode(mode: "file" | "segment" | "paste") {
    setForm((current) => ({ ...current, audienceMode: mode, segmentId: mode === "segment" ? current.segmentId : "" }));
    setRecipientPreviewError("");
    if (mode === "paste") {
      setRecipientPreview(pastedText.trim() ? analyzePastedNumbers(pastedText).valid.length : null);
    } else if (mode === "file") {
      setRecipientPreview(campaignFile ? numbersReport?.count ?? recipientPreview : null);
    } else {
      const segment = segments.find((item) => item.id === form.segmentId);
      setRecipientPreview(segment ? segment.recipientCount : null);
    }
  }

  function openReport(campaign: Campaign) {
    setReportCampaign(campaign);
  }

  async function submitCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSaving(true);

    if (form.id) {
      await fetch(`/api/campaigns/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, description: form.description, tags: form.tags })
      });
      await onRefreshData();
      setSaving(false);
      setFormOpen(false);
      return;
    }

    if (form.audienceMode === "file" && !campaignFile) {
      setFormError(t("ارفع ملف Excel أو CSV يحتوي على أرقام العملاء", "Upload an Excel or CSV file containing your customers' numbers"));
      setSaving(false);
      return;
    }

    if (form.audienceMode === "paste" && !analyzePastedNumbers(pastedText).valid.length) {
      setFormError(t("الصق أرقامًا صحيحة للعملاء - لا يوجد أي رقم معتمد.", "Paste valid customer numbers - there are no accepted numbers."));
      setSaving(false);
      return;
    }

    if (form.audienceMode === "segment" && !form.segmentId) {
      setFormError(t("اختر تقسيم جمهور لاستخدامه كجمهور الحملة", "Choose a segment to use as the campaign's audience"));
      setSaving(false);
      return;
    }

    if (needsHeaderMedia && !templateHasSavedMedia && !headerMediaFile) {
      setFormError(t("هذا القالب يحتاج صورة أو فيديو بالرأس - ارفعها قبل إنشاء الحملة", "This template needs a header image or video - upload one before creating the campaign"));
      setSaving(false);
      return;
    }

    const body = new FormData();
    body.set("name", form.name);
    body.set("templateName", form.templateName);
    body.set("scheduled", String(form.scheduled));
    body.set("scheduledAt", form.scheduledAt);
    body.set("recurring", String(form.recurring));
    body.set("recurrenceIntervalDays", String(form.recurrenceIntervalDays));
    body.set("recurrenceEndAt", form.recurrenceEndAt);
    body.set("audienceMode", form.audienceMode);
    if (form.audienceMode === "segment") {
      body.set("segmentId", form.segmentId);
    } else if (form.audienceMode === "paste") {
      body.set("pastedNumbers", pastedText);
    } else if (campaignFile) {
      body.set("file", campaignFile);
    }
    if (headerMediaFile) body.set("headerMedia", headerMediaFile);
    body.set("description", form.description);
    body.set("tags", form.tags);
    body.set("linkTrackingEnabled", String(form.linkTrackingEnabled));
    if (form.linkTrackingEnabled) body.set("destinationUrl", form.destinationUrl);

    const response = await fetch("/api/campaigns", { method: "POST", body });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setFormError(payload?.error || t("تعذر إنشاء الحملة", "Unable to create the campaign"));
      setSaving(false);
      return;
    }

    await onRefreshData();
    if (form.recurring) await loadRecurrences();
    setSaving(false);
    setFormOpen(false);
    if (payload?.data?.balanceWarning) notify(String(payload.data.balanceWarning), "info");
  }

  async function deleteCampaign(campaign: Campaign) {
    await deleteCampaignsTyped([campaign]);
  }

  async function stopCampaign(campaign: Campaign) {
    if (!(await confirmDialog(t(`إيقاف حملة ${campaign.name}؟ الأرقام اللي ما وصلها الإرسال بعد بتبقى موقوفة.`, `Stop the "${campaign.name}" campaign? Numbers that haven't been messaged yet will remain unsent.`), { confirmLabel: t("إيقاف", "Stop"), cancelLabel: t("تراجع", "Cancel") }))) return;
    await fetch(`/api/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ملغاة" })
    });
    await onRefreshData();
  }

  async function sendCampaignNow(campaign: Campaign) {
    const waiting = statsOf(campaign).pending || campaign.total;
    if (!balanceLoading && !balanceLoadError && balance < waiting) {
      const goOn = await confirmDialog(
        t(`رصيدك (${formatNumber(balance)} رسالة) لا يكفي لـ ${formatNumber(waiting)} مستلم. سيتوقف الإرسال عند نفاد الرصيد وتبقى الأرقام الباقية بالانتظار. هل تريد الإرسال بالرصيد المتاح؟`, `Your balance (${formatNumber(balance)} messages) does not cover ${formatNumber(waiting)} recipients. Sending stops when it runs out and the rest wait. Send with the available balance?`),
        { tone: "danger", title: t("الرصيد لا يكفي", "Not enough balance"), confirmLabel: t("إرسال بالرصيد المتاح", "Send with available balance"), cancelLabel: t("تراجع", "Cancel") }
      );
      if (!goOn) return;
    } else if (!(await confirmDialog(t(`إرسال حملة ${campaign.name} الآن إلى ${formatNumber(campaign.total)} مستلم؟`, `Send the "${campaign.name}" campaign now to ${formatNumber(campaign.total)} recipient(s)?`), { confirmLabel: t("إرسال الآن", "Send now"), cancelLabel: t("تراجع", "Cancel") }))) return;
    const response = await fetch(`/api/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sendNow: true })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      notify(payload?.error || t("تعذر بدء إرسال الحملة", "Unable to start the campaign"), "error");
      return;
    }
    await onRefreshData();
  }

  async function refreshCampaigns() {
    setRefreshState("loading");
    try {
      await onRefreshData();
      setRefreshState("idle");
    } catch {
      setRefreshState("error");
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const pageIds = campaignPagination.items.map((campaign) => campaign.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const selectedCampaigns = campaigns.filter((campaign) => selectedIds.has(campaign.id));

  async function patchCampaign(id: string, body: Record<string, unknown>) {
    const response = await fetch(`/api/campaigns/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) notify(payload?.error || t("تعذر تنفيذ الإجراء", "Could not complete the action"), "error");
    return response.ok;
  }

  async function archiveCampaigns(list: Campaign[], archived: boolean) {
    const eligible = list.filter((campaign) => archived ? campaign.status !== "قيد الإرسال" : campaign.status === "مؤرشفة");
    if (!eligible.length) {
      notify(archived ? t("أوقف الحملة أولاً ثم أرشفها", "Stop the campaign first, then archive it") : t("لا توجد حملات مؤرشفة محددة", "No archived campaigns selected"), "info");
      return;
    }
    setBulkBusy(true);
    // Restoring puts a finished campaign back as finished, and an unfinished one as stopped.
    for (const campaign of eligible) await patchCampaign(campaign.id, { status: archived ? "مؤرشفة" : statsOf(campaign).complete ? "الحملة أنجزت" : "ملغاة" });
    setBulkBusy(false);
    setSelectedIds(new Set());
    await onRefreshData();
    notify(archived ? t(`تمت أرشفة ${eligible.length} حملة`, `${eligible.length} campaign(s) archived`) : t(`تمت استعادة ${eligible.length} حملة`, `${eligible.length} campaign(s) restored`), "success");
  }

  async function deleteCampaignsTyped(list: Campaign[]) {
    const deletable = list.filter((campaign) => campaign.status !== "قيد الإرسال");
    if (!deletable.length) {
      notify(t("لا يمكن حذف حملة قيد الإرسال. أوقفها أولاً.", "A campaign that is sending cannot be deleted. Stop it first."), "info");
      return;
    }
    const single = deletable.length === 1;
    const confirmWord = single ? deletable[0].name : t("حذف", "delete");
    const accepted = await confirmDialog(
      single
        ? t(`سيُحذف التقرير وكل مستلمي حملة «${deletable[0].name}» نهائياً. يمكنك أرشفتها بدل الحذف.`, `The report and every recipient of “${deletable[0].name}” will be deleted for good. You can archive it instead.`)
        : t(`سيُحذف ${deletable.length} حملة بكل مستلميها نهائياً. يمكنك أرشفتها بدل الحذف.`, `${deletable.length} campaigns and all their recipients will be deleted for good. You can archive them instead.`),
      { tone: "danger", requireText: confirmWord, confirmLabel: t("حذف نهائي", "Delete forever"), cancelLabel: t("تراجع", "Cancel") }
    );
    if (!accepted) return;
    setBulkBusy(true);
    for (const campaign of deletable) await fetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
    setBulkBusy(false);
    setSelectedIds(new Set());
    await onRefreshData();
  }

  async function duplicateCampaign(campaign: Campaign) {
    const response = await fetch(`/api/campaigns/${campaign.id}/duplicate`, { method: "POST" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      notify(payload?.error || t("تعذر نسخ الحملة", "Could not duplicate the campaign"), "error");
      return;
    }
    await onRefreshData();
    notify(t("تم نسخ الحملة. راجعها ثم اضغط «إرسال الآن».", "Campaign duplicated. Review it, then press “Send now”."), "success");
  }

  async function resumeCampaign(campaign: Campaign) {
    if (await patchCampaign(campaign.id, { status: "قيد الإرسال" })) await onRefreshData();
  }

  async function retryFailedRecipients(campaign: Campaign) {
    const failed = statsOf(campaign).failed;
    if (!(await confirmDialog(t(`إعادة الإرسال لـ ${formatNumber(failed)} مستلم فشل إرسالهم؟ سيُخصم رصيد عن كل رسالة تصل.`, `Resend to the ${formatNumber(failed)} recipients that failed? One credit is used per delivered message.`), { confirmLabel: t("إعادة الإرسال", "Resend"), cancelLabel: t("تراجع", "Cancel") }))) return;
    if (await patchCampaign(campaign.id, { retryFailed: true })) await onRefreshData();
  }

  function exportCampaignsCsv(list: Campaign[]) {
    const header = [t("الحملة", "Campaign"), t("الحالة", "Status"), t("القالب", "Template"), t("تاريخ الإرسال", "Sent at"), t("حجم الجمهور", "Audience"), t("المُرسلة", "Sent"), t("وصلت", "Delivered"), t("قُرئت", "Read"), t("ردّ", "Replied"), t("فشلت", "Failed"), t("ألغوا الاشتراك", "Opted out"), t("آخر تحديث", "Last update")];
    const rows = list.map((campaign) => {
      const stats = statsOf(campaign);
      const when = parseStoredDate(campaign.sentAt) ?? parseStoredDate(campaign.scheduledAt);
      return [campaign.name, campaignStatusLabel(campaign.status, t), campaign.templateName ?? "", when ? when.toISOString() : "", stats.total, stats.sent, stats.delivered, stats.read, stats.replied, stats.failed, stats.optedOut, parseStoredDate(campaign.updatedAt)?.toISOString() ?? campaign.updatedAt];
    });
    downloadTextFile(`campaigns-${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(header, rows));
  }

  /** Opens the top-up window with at least the missing messages filled in (rounded up to a thousand). */
  function openTopUp(missing = 0) {
    if (missing > 0) setChargeMessages(String(Math.max(1000, Math.ceil(missing / 1000) * 1000)));
    setChargeError("");
    setChargeOpen(true);
  }

  function openReschedule(campaign: Campaign) {
    const when = parseStoredDate(campaign.scheduledAt);
    // The picker works in Riyadh time, like the create form.
    const local = when ? new Date(when.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 16) : "";
    setRescheduleValue(local);
    setRescheduleError("");
    setRescheduling(campaign);
  }

  async function saveReschedule() {
    if (!rescheduling) return;
    setRescheduleSaving(true);
    setRescheduleError("");
    const response = await fetch(`/api/campaigns/${rescheduling.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduledAt: rescheduleValue }) });
    const payload = await response.json().catch(() => null);
    setRescheduleSaving(false);
    if (!response.ok) {
      setRescheduleError(payload?.error || t("تعذر تعديل الموعد", "Could not change the time"));
      return;
    }
    setRescheduling(null);
    await onRefreshData();
  }

  async function createChargeRequest() {
    if (!chargeTier) return;
    setChargeError("");
    setChargeSubmitting(true);

    const response = await fetch("/api/campaigns/balance/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: parsedChargeMessages })
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setChargeError(payload?.error || t("تعذر إنشاء طلب الشحن", "Unable to create the top-up request"));
      setChargeSubmitting(false);
      return;
    }

    window.open(`/billing/pay/campaign/${payload?.data?.paymentId}`, "_blank", "noopener");
    setChargeSubmitting(false);
    setChargeOpen(false);
    loadBalance();
  }

  return (
    <section className="page-stack campaigns-page">
      <div className="camp-hero">
        <div className="camp-hero-text">
          <small>{t("مركز الحملات", "CAMPAIGN CENTER")}</small>
          <h1>{t("حملات الواتساب", "WhatsApp campaigns")}</h1>
          <p>{t("أنشئ جمهورك، اختر القالب، راجع التفاصيل ثم تابع التنفيذ من مكان واحد.", "Build your audience, choose a template, review details, and track execution in one place.")}</p>
          <div className="camp-hero-chips">
            <span>{formatNumber(campaigns.filter((campaign) => campaign.status !== "مؤرشفة").length)} {t("إجمالي الحملات", "campaigns")}</span>
            <span>{t("تصفية حسب الحالة", "Status filter")}: {campaignStatusFilter === "all" ? t("الكل", "All") : campaignStatusLabel(campaignStatusFilter, t)}</span>
          </div>
        </div>
        <label className="camp-hero-search"><span aria-hidden="true">🔍</span><input value={campaignSearch} onChange={(event) => { setCampaignSearch(event.target.value); setCampaignPage(1); setActiveTab("campaigns"); }} placeholder={t("بحث باسم الحملة...", "Search campaigns...")} aria-label={t("بحث في الحملات", "Search campaigns")} /></label>
        <CustomSelect className="camp-hero-period" value={periodFilter} onChange={applyPeriod} options={[{ value: "all", label: t("كل الفترات", "All time") }, { value: "today", label: t("اليوم", "Today") }, { value: "week", label: t("آخر 7 أيام", "Last 7 days") }, { value: "month", label: t("هذا الشهر", "This month") }, { value: "year", label: t("هذه السنة", "This year") }]} />
        <button className="camp-hero-new" type="button" onClick={() => openForm()}>＋ {t("حملة جديدة", "New campaign")}</button>
      </div>
      {hubTabs}
      <div className="camp-subtabs">
        <button type="button" className={activeTab === "campaigns" ? "on" : ""} onClick={() => setActiveTab("campaigns")}>{t("نظرة الحملات", "Campaign overview")}</button>
        <button type="button" className={activeTab === "balance" ? "on" : ""} onClick={() => setActiveTab("balance")}>{t("الرصيد و الشحن", "Balance & Top-up")}</button>
      </div>

      {activeTab === "campaigns" ? (
        <>
          {!balanceLoading && !balanceLoadError && queuedMessages > balance ? (
            <div className="balance-low-banner critical" role="alert">
              <span>⛔</span>
              <div>
                <strong>{t("رصيدك لا يكفي لكل الحملات المنتظرة", "Your balance does not cover every queued campaign")}</strong>
                <p>{t(`بانتظار الإرسال ${formatNumber(queuedMessages)} رسالة والرصيد ${formatNumber(balance)}. ينقصك ${(queuedMessages - balance).toLocaleString("en-US")} رسالة.`, `${formatNumber(queuedMessages)} messages are queued and the balance is ${formatNumber(balance)}. You are short by ${(queuedMessages - balance).toLocaleString("en-US")}.`)}</p>
              </div>
              <button className="btn primary" type="button" onClick={() => openTopUp(queuedMessages - balance)}>{t("شحن الرصيد", "Top up balance")}</button>
            </div>
          ) : null}
          <details className="camp-summary">
            <summary>{t("ملخص ومؤشرات الحملات", "Campaign summary and readiness")}</summary>
          <section className="campaign-health-grid" aria-label={t("جاهزية الحملات", "Campaign readiness")}>
            <article className={whatsappConnected ? "is-ready" : "is-blocked"}><span>◉</span><div><b>{t("قناة الإرسال", "Sending channel")}</b><strong>{whatsappConnected ? t("واتساب متصل", "WhatsApp connected") : t("تحتاج ربط", "Connection required")}</strong></div></article>
            <article className={approvedTemplates.length && !rejectedTemplates.length ? "is-ready" : "is-blocked"}>
              <a className="campaign-health-link" href="/dashboard?view=templates" aria-label={t("فتح صفحة القوالب", "Open the templates page")}>
                <span>◇</span>
                <div>
                  <b>{t("القوالب الجاهزة", "Ready templates")}</b>
                  <strong>{approvedTemplates.length} {t("قالب معتمد", "approved templates")}</strong>
                  {rejectedTemplates.length ? <small className="campaign-health-warn">{t(`${rejectedTemplates.length} قالب مرفوض من Meta — عدّله وأعد إرساله`, `${rejectedTemplates.length} template(s) rejected by Meta — edit and resubmit`)}</small> : null}
                  {reviewTemplates.length ? <small className="campaign-health-note">{t(`${reviewTemplates.length} قالب قيد المراجعة`, `${reviewTemplates.length} template(s) under review`)}</small> : null}
                </div>
              </a>
            </article>
            <article><span>↗</span><div><b>{t("نسبة الإرسال", "Send rate")}</b><strong>{campaignOverview.sendRate}%</strong><small dir="ltr">{formatNumber(campaignOverview.sent)} / {formatNumber(campaignOverview.recipients)}</small></div></article>
          </section>
          {refreshState === "error" ? (
            <div className="balance-low-banner critical" role="alert">
              <span>⛔</span>
              <div><strong>{t("تعذر تحديث بيانات الحملات", "Could not refresh the campaigns")}</strong><p>{t("الأرقام المعروضة قد تكون قديمة. تحقق من اتصالك ثم حاول من جديد.", "The numbers shown may be out of date. Check your connection and try again.")}</p></div>
              <button className="btn primary" type="button" onClick={refreshCampaigns}>{t("إعادة المحاولة", "Try again")}</button>
            </div>
          ) : null}
          {campaigns.length ? (<>
          <section className={`campaign-kpis${refreshState === "loading" ? " is-loading" : ""}`} aria-busy={refreshState === "loading"} aria-label={t("ملخص الحملات", "Campaign summary")}>
            {([
              { key: "sent", label: t("تم إرسالها", "Sent"), value: formatNumber(campaignOverview.sent), note: t("رسالة عبر جميع الحملات", "messages across campaigns") },
              { key: "pending", label: t("بانتظار الإرسال", "Pending"), value: formatNumber(campaignOverview.remaining), note: t("ما زال في الطابور", "still in the queue") },
              { key: "completed", label: t("حملات مكتملة", "Completed"), value: String(campaignOverview.completed), note: t("أنهت عملية الإرسال", "finished sending") },
              { key: "active", label: t("نشطة أو مجدولة", "Active or scheduled"), value: String(campaignOverview.active), note: t("تحتاج متابعة تشغيلية", "need operational follow-up") }
            ] as Array<{ key: KpiFilter; label: string; value: string; note: string }>).map((card) => (
              <article key={card.key} className={kpiFilter === card.key ? "is-active" : ""}>
                <button type="button" aria-pressed={kpiFilter === card.key} onClick={() => { setKpiFilter((current) => (current === card.key ? "all" : card.key)); setCampaignPage(1); }}>
                  <span>{card.label}</span><strong>{card.value}</strong><small>{card.note}</small>
                </button>
              </article>
            ))}
          </section>
          <section className={`campaign-funnel${refreshState === "loading" ? " is-loading" : ""}`} aria-busy={refreshState === "loading"} aria-label={t("مسار الرسائل", "Message funnel")}>
            {([
              { key: "sent", label: t("المُرسلة", "Sent"), value: campaignOverview.totals.sent, share: formatRate(campaignOverview.totals.sent, campaignOverview.totals.total), of: t("من الجمهور", "of audience") },
              { key: "delivered", label: t("وصلت (مؤكدة)", "Delivered (confirmed)"), value: campaignOverview.totals.delivered, share: formatRate(campaignOverview.totals.delivered, campaignOverview.totals.sent), of: t("من المُرسلة", "of sent") },
              { key: "unconfirmed", label: t("بلا إيصال", "No receipt"), value: campaignOverview.totals.unconfirmed, share: formatRate(campaignOverview.totals.unconfirmed, campaignOverview.totals.sent), of: t("من المُرسلة", "of sent") },
              { key: "read", label: t("قُرئت", "Read"), value: campaignOverview.totals.read, share: formatRate(campaignOverview.totals.read, campaignOverview.totals.sent), of: t("من المُرسلة", "of sent") },
              { key: "replied", label: t("ردّ العميل", "Replied"), value: campaignOverview.totals.replied, share: formatRate(campaignOverview.totals.replied, campaignOverview.totals.sent), of: t("من المُرسلة", "of sent") },
              { key: "failed", label: t("فشلت", "Failed"), value: campaignOverview.totals.failed, share: formatRate(campaignOverview.totals.failed, campaignOverview.totals.total), of: t("من الجمهور", "of audience") },
              { key: "optedOut", label: t("ألغوا الاشتراك", "Opted out"), value: campaignOverview.totals.optedOut, share: formatRate(campaignOverview.totals.optedOut, campaignOverview.totals.total), of: t("من الجمهور", "of audience") }
            ] as Array<{ key: string; label: string; value: number; share: number; of: string }>).map((step) => (
              <article key={step.key} className={`funnel-${step.key}`}>
                <span>{step.label}</span>
                <strong>{formatNumber(step.value)}</strong>
                <small><bdi dir="ltr">{step.share}%</bdi> {step.of}</small>
              </article>
            ))}
          </section>
          {campaignOverview.totals.unconfirmed > 0 ? (
            <p className="campaign-receipt-note">
              {t(`${formatNumber(campaignOverview.totals.unconfirmed)} رسالة قبلها واتساب ولم يصلنا لها إيصال وصول ولا قراءة ولا فشل. غالبًا وصلت، لكن عملاء يوقفون إيصالات القراءة، وحملات سبقت تسجيل إيصالات الوصول لا تُظهر إلا من قرأ. المُرسلة = وصلت المؤكدة + بلا إيصال + فشلت بعد القبول.`, `${formatNumber(campaignOverview.totals.unconfirmed)} messages were accepted by WhatsApp with no delivered, read or failed receipt. Most likely they arrived, but some customers turn read receipts off, and campaigns older than delivery-receipt tracking only show who read. Sent = confirmed delivered + no receipt + failed after acceptance.`)}
            </p>
          ) : null}
          {campaignOverview.totals.failureReasons.length ? (
            <p className="campaign-failure-reasons">
              <b>{t("أسباب الفشل:", "Why messages failed:")}</b>{" "}
              {campaignOverview.totals.failureReasons.map((reason) => `${t(failureReasonLabels[reason.key][0], failureReasonLabels[reason.key][1])} (${formatNumber(reason.count)})`).join(" · ")}
            </p>
          ) : null}
          </>) : null}
          </details>
          {recurrences.length ? (
            <div className="campaign-board recurrence-board">
              <div className="campaign-list-head"><div><h2>🔁 {t("الحملات المتكررة", "Recurring campaigns")}</h2><p>{t("سلاسل ترسل نفس الملف المرفوع تلقائيًا كل فترة.", "Series that automatically resend the uploaded file on a schedule.")}</p></div></div>
              <div className="recurrence-list">
                {recurrences.map((recurrence) => (
                  <div className="recurrence-row" key={recurrence.id}>
                    <div>
                      <b>{recurrence.name}</b>
                      <span>{t(recurrenceIntervalOptions.find((option) => option.days === recurrence.intervalDays)?.ar || "", recurrenceIntervalOptions.find((option) => option.days === recurrence.intervalDays)?.en || "")} · {t(`${recurrence.occurrences} إرسال حتى الآن`, `${recurrence.occurrences} sends so far`)}</span>
                    </div>
                    <span className={`recurrence-status ${recurrence.status === "نشطة" ? "active" : recurrence.status === "متوقفة" ? "paused" : "ended"}`}>
                      {recurrence.status === "نشطة" ? t("نشطة", "Active") : recurrence.status === "متوقفة" ? t("متوقفة", "Paused") : t("منتهية", "Ended")}
                    </span>
                    <span className="recurrence-next">{recurrence.status === "نشطة" ? t(`القادم: ${formatDateTime(recurrence.nextRunAt)}`, `Next: ${formatDateTime(recurrence.nextRunAt)}`) : "—"}</span>
                    {recurrence.status !== "منتهية" ? (
                      <button className="btn soft" type="button" onClick={() => toggleRecurrence(recurrence.id, recurrence.status === "نشطة" ? "متوقفة" : "نشطة")}>
                        {recurrence.status === "نشطة" ? t("إيقاف", "Pause") : t("استئناف", "Resume")}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {campaignStatusFilter === "مجدولة" && upcomingCampaigns.length ? (
            <div className="campaign-board upcoming-board">
              <div className="campaign-list-head"><div><h2>{t("الحملات المجدولة القادمة", "Upcoming scheduled campaigns")}</h2><p>{t("إجمالي المجدولة", "Total scheduled")} {formatNumber(upcomingCampaigns.length)} · {t("مرتبة بوقت الإرسال", "sorted by send time")}</p></div></div>
              <ul className="upcoming-list">
                {upcomingCampaigns.map((campaign) => {
                  const when = parseStoredDate(campaign.scheduledAt);
                  return (
                    <li key={campaign.id}>
                      <div>
                        <b>{campaign.name}</b> <span className="state warn"><i className="camp-dot" />{t("مجدولة", "Scheduled")}</span>
                        <small>{campaign.templateName} · {statsOf(campaign).total.toLocaleString("en-US")} {t("مستلم", "recipients")}</small>
                      </div>
                      <div className="upcoming-when">
                        {when ? <><strong>{formatFullDateTime(when, language === "en" ? "en" : "ar")}</strong><small>{formatRelativeTime(when, language === "en" ? "en" : "ar")}</small></> : null}
                      </div>
                      <div className="upcoming-actions">
                        <button className="btn soft" type="button" onClick={() => openReschedule(campaign)}>{t("تعديل الموعد", "Change time")}</button>
                        <button className="btn soft" type="button" onClick={() => stopCampaign(campaign)}>{t("إلغاء", "Cancel")}</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {!campaigns.length ? (
            <div className="campaign-board campaign-onboarding">
              <h2>{t("ابدأ أول حملة واتساب", "Start your first WhatsApp campaign")}</h2>
              <p>{t("ثلاث خطوات فقط، وتصل رسالتك إلى جمهورك.", "Three steps and your message reaches your audience.")}</p>
              <ol>
                <li><b>{t("اختر قالباً معتمداً", "Choose an approved template")}</b><span>{approvedTemplates.length ? t(`لديك ${approvedTemplates.length} قالب جاهز.`, `You have ${approvedTemplates.length} ready template(s).`) : t("لا يوجد قالب معتمد بعد، أنشئ قالباً وانتظر اعتماد Meta.", "No approved template yet: create one and wait for Meta's approval.")}</span></li>
                <li><b>{t("ارفع جمهورك", "Add your audience")}</b><span>{t("ملف Excel أو CSV بأرقام العملاء، أو شريحة جاهزة من عملائك.", "An Excel or CSV file of numbers, or a ready segment of your customers.")}</span></li>
                <li><b>{t("راجع وأرسل", "Review and send")}</b><span>{t("يظهر عدد الرسائل مقابل رصيدك قبل الإرسال، وتتابع النتائج من هذه الصفحة.", "The number of messages against your balance shows before sending, and results are tracked on this page.")}</span></li>
              </ol>
              <div className="campaign-onboarding-actions">
                <button className="btn primary" type="button" onClick={() => openForm()} disabled={!whatsappConnected || !approvedTemplates.length}>＋ {t("إنشاء حملة", "Create a campaign")}</button>
                {!whatsappConnected ? <small>{t("اربط واتساب أولاً من صفحة القنوات.", "Connect WhatsApp first from the Channels page.")}</small> : !approvedTemplates.length ? <a className="btn soft" href="/dashboard?view=templates">{t("الذهاب إلى القوالب", "Go to templates")}</a> : null}
              </div>
            </div>
          ) : (
          <>
      <div className="camp-pills">
        {([["all", t("الكل", "All"), "#91a29e"], ["مجدولة", t("مجدولة", "Scheduled"), "#4a90d9"], ["قيد الإرسال", t("قيد الإرسال", "Sending"), "#f0ad4e"], ["الحملة أنجزت", t("منتهية", "Completed"), "#2e9e6b"], ["ملغاة", t("ملغاة", "Cancelled"), "#d9534f"], ["مؤرشفة", t("مؤرشفة", "Archived"), "#667873"]] as Array<[string, string, string]>).map(([value, label, color]) => (
          <button key={value} type="button" className={campaignStatusFilter === value ? "camp-pill on" : "camp-pill"} onClick={() => { setCampaignStatusFilter(value); setCampaignPage(1); }}>
            <i style={{ background: color }} />{label} <b>{formatNumber(campaigns.filter((campaign) => value === "مؤرشفة" ? campaign.status === "مؤرشفة" : campaign.status !== "مؤرشفة" && (value === "all" || campaign.status === value)).length)}</b>
          </button>
        ))}
      </div>
          <div className={`campaign-board campaign-list-board${refreshState === "loading" ? " is-loading" : ""}`} aria-busy={refreshState === "loading"}>
            <div className="campaign-list-head"><div><h2>{t("الحملات", "Campaigns")}</h2><p>{t("إجمالي الحملات", "Total campaigns")} {formatNumber(filteredCampaigns.length)}</p></div><button className="reload" type="button" onClick={refreshCampaigns} disabled={refreshState === "loading"}>↻ {t("تحديث البيانات", "Refresh data")}</button></div>
            <div className="seg-toolbar campaign-filterbar camp-filterrow">
              <CustomSelect value={campaignSort} onChange={setCampaignSort} options={[{value:"latest",label:t("الأحدث أولاً","Latest first")},{value:"sent",label:t("الأكثر إرسالاً","Most sent")},{value:"progress",label:t("الأعلى تقدماً","Highest progress")},{value:"name",label:t("حسب الاسم","By name")}]} />
              <label className="entries">{t("عرض", "Show")} <CustomSelect className="page-size" value={campaignPageSize} onChange={(value) => { setCampaignPageSize(value); setCampaignPage(1); }} options={pageSizeOptions} /></label>
              <label className="campaign-date-filter"><span>{t("من", "From")}</span><input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => { setDateFrom(event.target.value); setCampaignPage(1); }} /></label>
              <label className="campaign-date-filter"><span>{t("إلى", "To")}</span><input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setDateTo(event.target.value); setCampaignPage(1); }} /></label>
              <CustomSelect value={channelFilter} onChange={(value) => { setChannelFilter(value); setCampaignPage(1); }} options={[{ value: "all", label: t("كل القنوات", "All channels") }, ...channelOptions.map((channel) => ({ value: channel, label: channelLabels[channel] ? t(channelLabels[channel][0], channelLabels[channel][1]) : channel }))]} />
              <CustomSelect value={templateFilter} onChange={(value) => { setTemplateFilter(value); setCampaignPage(1); }} options={[{ value: "all", label: t("كل القوالب", "All templates") }, ...templateOptions.map((name) => ({ value: name, label: name }))]} />
              {dateFrom || dateTo || channelFilter !== "all" || templateFilter !== "all" || kpiFilter !== "all" ? (
                <button className="btn soft" type="button" onClick={() => { setDateFrom(""); setDateTo(""); setChannelFilter("all"); setTemplateFilter("all"); setKpiFilter("all"); setCampaignPage(1); }}>{t("مسح الفلاتر", "Clear filters")}</button>
              ) : null}
              <button className="btn soft" type="button" onClick={() => exportCampaignsCsv(filteredCampaigns)} disabled={!filteredCampaigns.length}>{t("تصدير CSV", "Export CSV")}</button>
              <span className="seg-total-pill">{t("الإجمالي", "Total")}: <b>{formatNumber(filteredCampaigns.length)}</b></span>
            </div>
            {selectedCampaigns.length ? (
              <div className="campaign-bulkbar" role="region" aria-label={t("إجراءات جماعية", "Bulk actions")}>
                <b>{t(`${selectedCampaigns.length} محددة`, `${selectedCampaigns.length} selected`)}</b>
                <button className="btn soft" type="button" disabled={bulkBusy} onClick={() => exportCampaignsCsv(selectedCampaigns)}>{t("تصدير", "Export")}</button>
                {campaignStatusFilter === "مؤرشفة"
                  ? <button className="btn soft" type="button" disabled={bulkBusy} onClick={() => archiveCampaigns(selectedCampaigns, false)}>{t("استعادة", "Restore")}</button>
                  : <button className="btn soft" type="button" disabled={bulkBusy} onClick={() => archiveCampaigns(selectedCampaigns, true)}>{t("أرشفة", "Archive")}</button>}
                <button className="btn danger" type="button" disabled={bulkBusy} onClick={() => deleteCampaignsTyped(selectedCampaigns)}>{t("حذف", "Delete")}</button>
                <button className="btn soft" type="button" onClick={() => setSelectedIds(new Set())}>{t("إلغاء التحديد", "Clear selection")}</button>
              </div>
            ) : null}
            <div className="table-wrap">
              <table className="mobile-card-table campaigns-table camp-table">
                <thead><tr>
                  <th className="select-col"><input type="checkbox" aria-label={t("تحديد كل حملات الصفحة", "Select all campaigns on this page")} checked={allOnPageSelected} onChange={() => setSelectedIds((current) => { const next = new Set(current); if (allOnPageSelected) pageIds.forEach((id) => next.delete(id)); else pageIds.forEach((id) => next.add(id)); return next; })} /></th>
                  <th>{t("الحملة", "Campaign")}</th><th>{t("تم إرساله / الإجمالي", "Sent / total")}</th><th>{t("التقدم", "Progress")}</th><th>{t("الحالة", "Status")}</th><th>{t("آخر تحديث", "Last update")}</th><th>{t("الإجراءات", "Actions")}</th>
                </tr></thead>
                <tbody>
                  {campaignPagination.items.map((campaign) => {
                    const stats = statsOf(campaign);
                    return (
                    <tr key={campaign.id} className={selectedIds.has(campaign.id) ? "is-selected" : ""}>
                      <td className="select-col"><input type="checkbox" aria-label={t(`تحديد ${campaign.name}`, `Select ${campaign.name}`)} checked={selectedIds.has(campaign.id)} onChange={() => toggleSelected(campaign.id)} /></td>
                      <td data-label={t("الحملة", "Campaign")}><div className="campaign-name"><span className="campaign-thumb">{campaign.hasHeaderMedia && !brokenThumbIds.has(campaign.id) ? <Image src={`/api/whatsapp/campaign-media/${campaign.id}`} alt="" width={42} height={42} unoptimized onError={() => setBrokenThumbIds((current) => new Set(current).add(campaign.id))} /> : firstChar(campaign.name.trim()) || "؟"}</span><span><b title={campaign.name}>{campaign.name}</b>{campaign.recurrenceId ? <em className="recurrence-badge" title={t("جزء من سلسلة متكررة", "Part of a recurring series")}>🔁</em> : null}
                        {campaign.description ? <small className="campaign-description">{campaign.description}</small> : null}
                        {campaign.tags?.length ? <span className="campaign-tags">{campaign.tags.map((tag) => <em key={tag}>{tag}</em>)}</span> : null}</span></div></td>
                      <td data-label={t("تم إرساله / الإجمالي", "Sent / total")}><b>{formatNumber(campaign.sent)}</b><small className="campaign-cell-note"> {t("من", "of")} {formatNumber(campaign.total)}</small>{stats.pending > 0 ? <small className="campaign-cell-note campaign-cell-pending"> · {formatNumber(stats.pending)} {t("بالانتظار", "waiting")}</small> : null}</td>
                      <td data-label={t("التقدم", "Progress")}><div className="camp-progress"><div className="camp-bar"><i style={{ width: campaign.progress }} /></div><span>{campaign.progress}</span></div></td>
                      <td data-label={t("الحالة", "Status")}><span className={campaign.status === "ملغاة" || campaign.status === "مؤرشفة" ? "state off" : campaign.status === "مجدولة" ? "state warn" : "state ok"}><i className="camp-dot" />{campaignStatusLabel(campaign.status, t)}</span></td>
                      <td data-label={t("آخر تحديث", "Last update")}><DateCell value={parseStoredDate(campaign.updatedAt)} language={language === "en" ? "en" : "ar"} /></td>
                      <td data-label={t("الإجراءات", "Actions")} className="row-actions campaign-row-actions">
                        <button className="campaign-icon-btn" type="button" title={t("التقرير", "Report")} aria-label={t("التقرير", "Report")} onClick={() => openReport(campaign)}>{reportIcon}</button>
                        <button className="campaign-icon-btn" type="button" title={t("نسخ الحملة", "Duplicate")} aria-label={t("نسخ الحملة", "Duplicate")} onClick={() => duplicateCampaign(campaign)}>{copyIcon}</button>
                        {campaign.status === "قيد الإرسال" ? null : <button className="campaign-icon-btn" type="button" title={campaign.status === "مؤرشفة" ? t("استعادة من الأرشيف", "Restore from archive") : t("أرشفة", "Archive")} aria-label={campaign.status === "مؤرشفة" ? t("استعادة من الأرشيف", "Restore from archive") : t("أرشفة", "Archive")} onClick={() => archiveCampaigns([campaign], campaign.status !== "مؤرشفة")}>{archiveIcon}</button>}
                        {campaign.status === "مجدولة" && campaign.total > 0 ? <button className="btn primary" type="button" onClick={() => sendCampaignNow(campaign)}>{t("إرسال الآن", "Send now")}</button> : null}
                        {campaign.status === "قيد الإرسال" || campaign.status === "مجدولة" ? <button className="btn soft" type="button" onClick={() => stopCampaign(campaign)}>{t("إيقاف", "Stop")}</button> : null}
                        {campaign.status === "ملغاة" && stats.pending > 0 ? <button className="btn soft" type="button" onClick={() => resumeCampaign(campaign)}>{t("استئناف", "Resume")}</button> : null}
                        <RowMenu
                          label={t(`خيارات ${campaign.name}`, `Options for ${campaign.name}`)}
                          items={[
                            { key: "edit", label: t("تعديل الاسم والوصف", "Edit name and notes"), onSelect: () => openForm(campaign) },
                            { key: "retry", label: t("إعادة الإرسال للفاشلين فقط", "Resend to failed only"), onSelect: () => retryFailedRecipients(campaign), hidden: stats.failed === 0 || campaign.status === "قيد الإرسال" },
                            { key: "export", label: t("تصدير المستلمين", "Export recipients"), onSelect: () => openReport(campaign) },
                            { key: "delete", label: t("حذف…", "Delete…"), onSelect: () => deleteCampaign(campaign), danger: true, hidden: campaign.status === "قيد الإرسال" }
                          ]}
                        />
                      </td>
                    </tr>
                    );
                  })}
                  {!campaignPagination.items.length ? <tr><td colSpan={7}><div className="campaign-empty"><strong>{t("لا توجد حملات مطابقة", "No matching campaigns")}</strong><span>{t("غيّر البحث أو الحالة، أو أنشئ حملة جديدة.", "Adjust the filters or create a new campaign.")}</span></div></td></tr> : null}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={campaignPagination.page} totalPages={campaignPagination.totalPages} onPageChange={setCampaignPage} />
          </div>
          </>
          )}
        </>
      ) : (
        <div className="balance-page">
          {balanceLoadError ? <p className="form-error" role="alert">{balanceLoadError} <button className="btn soft" type="button" onClick={loadBalance}>{t("إعادة المحاولة", "Try again")}</button></p> : null}
          {(() => {
            if (!lastTopUpAmount) return null;
            const percentRemaining = (balance / lastTopUpAmount) * 100;
            if (percentRemaining > 20) return null;
            const critical = percentRemaining <= 5;
            return (
              <div className={`balance-low-banner ${critical ? "critical" : "warning"}`} role="alert">
                <span>{critical ? "⛔" : "⚠️"}</span>
                <div>
                  <strong>{t(`رصيدك منخفض — ${Math.round(percentRemaining)}% متبقٍ`, `Balance running low — ${Math.round(percentRemaining)}% remaining`)}</strong>
                  <p>{t(`تبقّى لديك ${formatNumber(balance)} رسالة فقط. اشحن الآن حتى لا تتوقف حملاتك القادمة.`, `Only ${formatNumber(balance)} messages left. Top up now to avoid interrupting upcoming campaigns.`)}</p>
                </div>
                <button className="btn primary" type="button" onClick={() => setChargeOpen(true)}>{t("شحن الآن", "Top up now")}</button>
              </div>
            );
          })()}
          <section className="campaign-balance-hero">
            <div><span>{t("رصيد الحملات", "CAMPAIGN BALANCE")}</span><h2>{t("تحكّم في رصيد الإرسال من مكان واحد", "Manage your sending balance in one place")}</h2><p>{t("اشحن الرصيد حسب احتياجك، ثم راقب كل عملية إضافة أو استخدام في السجل المالي أدناه.", "Top up as needed, then review every credit and usage entry in the ledger below.")}</p></div>
            <div className="campaign-balance-total"><small>{t("الرصيد المتاح", "Available balance")}</small><strong aria-busy={balanceLoading}>{balanceLoading ? <span className="skeleton-number" role="status" aria-label={t("جارٍ التحميل", "Loading")} /> : balanceLoadError ? "—" : formatNumber(balance)}</strong><span>{t("رسالة", "messages")}</span><button className="btn primary" type="button" onClick={() => setChargeOpen(true)}>＋ {t("شحن الرصيد", "Top up balance")}</button></div>
          </section>
          <section className="balance-kpi-grid">
            <article><span>{t("الاستخدام الكلي", "Total usage")}</span><strong>{formatNumber(campaignOverview.sent)}</strong><small>{t("رسالة مستخدمة في الحملات", "messages used in campaigns")}</small></article>
            <article><span>{t("المعاملات المسجلة", "Recorded transactions")}</span><strong>{balanceLoading ? <span className="skeleton-number" role="status" aria-label={t("جارٍ التحميل", "Loading")} /> : balanceTransactions.length}</strong><small>{t("عمليات شحن واستخدام", "top-up and usage entries")}</small></article>
            <article className="balance-pricing-card"><span>{t("التسعير حسب الحجم", "Volume pricing")}</span><strong>{t("ابتداءً من 0.012 ريال", "From SAR 0.012")}</strong><button type="button" onClick={() => setPricingOpen(true)}>{t("عرض جدول الأسعار", "View pricing table")} ←</button></article>
          </section>

          <div className="campaign-board balance-board transactions-board">
            <div className="transactions-head">
              <div><h2>{t("سجل المعاملات", "Transaction ledger")}</h2><p>{t("جميع حركات الرصيد مرتبة داخل جدول واحد.", "All balance movements in one table.")}</p></div>
            </div>
            <div className="campaign-toolbar transactions-toolbar">
              <input value={balanceSearch} onChange={(event) => { setBalanceSearch(event.target.value); setBalancePage(1); }} placeholder={t("ابحث في الاستخدام أو الحالة أو التاريخ…", "Search usage, status, or date…")} />
              <label className="entries">
                {t("عرض", "Show")}
                <CustomSelect className="page-size" value={balancePageSize} onChange={(value) => { setBalancePageSize(value); setBalancePage(1); }} options={pageSizeOptions} />
                {t("صفوف", "rows")}
              </label>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t("رصيد", "Balance")}</th><th>{t("الاستخدام", "Usage")}</th><th>{t("الحالة", "Status")}</th><th>{t("التاريخ", "Date")}</th></tr></thead>
                <tbody>
                  {balancePagination.items.map((item) => (
                    <tr key={item.id}>
                      <td><span className={item.balance > 0 ? "balance-credit" : "balance-debit"}>{formatBalanceMovement(item.balance)}</span></td>
                      <td>{item.usage}</td>
                      <td><span className={item.status === "مكتمل" ? "state ok" : item.status === "قيد الانتظار" ? "state warn" : "state off"}>{transactionStatusLabel(item.status, t)}</span></td>
                      <td dir="ltr">{formatDateTime(item.date)}</td>
                    </tr>
                  ))}
                  {!balancePagination.items.length ? (
                    <tr><td colSpan={4}>{t("لا توجد معاملات مطابقة للبحث.", "No transactions match your search.")}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={balancePagination.page} totalPages={balancePagination.totalPages} onPageChange={setBalancePage} />
          </div>
        </div>
      )}

      {rescheduling ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setRescheduling(null)}>
          <div className="account-modal form-modal reschedule-modal" role="dialog" aria-modal="true" aria-label={t("تعديل موعد الحملة", "Change the campaign time")} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head"><button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setRescheduling(null)}>×</button><div><h2>{t("تعديل موعد الإرسال", "Change the send time")}</h2></div></header>
            <div className="account-modal-body form-grid">
              <p>{t(`الحملة: ${rescheduling.name}. الوقت بتوقيت الرياض.`, `Campaign: ${rescheduling.name}. Time is Riyadh time.`)}</p>
              <label><span>{t("موعد الإرسال", "Send time")}</span><input type="datetime-local" value={rescheduleValue} onChange={(event) => setRescheduleValue(event.target.value)} /></label>
              {rescheduleError ? <p className="form-error" role="alert">{rescheduleError}</p> : null}
            </div>
            <footer className="modal-foot"><button className="btn soft" type="button" onClick={() => setRescheduling(null)}>{t("إلغاء", "Cancel")}</button><button className="btn primary" type="button" disabled={rescheduleSaving || !rescheduleValue} onClick={saveReschedule}>{rescheduleSaving ? t("جارٍ الحفظ…", "Saving…") : t("حفظ الموعد", "Save time")}</button></footer>
          </div>
        </div>
      ) : null}

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => void requestCloseForm()}>
          <form className="account-modal form-modal campaign-create-modal campaign-builder-modal" role="dialog" aria-modal="true" aria-label={t("حفظ حملة", "Save campaign")} onSubmit={submitCampaign} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head campaign-builder-head"><button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => void requestCloseForm()}>×</button><div><span>{t("منشئ الحملات", "CAMPAIGN BUILDER")}</span><h2>{form.id ? t("تعديل اسم الحملة", "Edit campaign name") : t("إنشاء حملة جديدة", "Create a new campaign")}</h2></div></header>
            <div className="account-modal-body form-grid campaign-builder-fields">
              {!form.id ? <div className="campaign-warning">{t("الرجاء قبل إرسال أي حملة قم بإنشاء حملة تجريبية تحتوي على رقمك فقط، لتتأكد من الإرسال ووصول الرسالة دون أي مشكلة في الإرسال", "Before sending any campaign, please create a test campaign with just your own number to confirm the message sends and arrives without issues.")}</div> : null}
              <label><span>{t("اسم الحملة", "Campaign name")}</span><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("اسم الحملة", "Campaign name")} required /></label>
              <label><span>{t("وصف (اختياري)", "Description (optional)")}</span><input value={form.description} maxLength={300} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder={t("ملاحظة تظهر تحت اسم الحملة", "A note shown under the campaign name")} /></label>
              <label><span>{t("وسوم (اختياري)", "Tags (optional)")}</span><input value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} placeholder={t("مثال: رمضان، عملاء VIP", "e.g. Ramadan, VIP")} /></label>
              {!form.id ? (
                <>
                  <label>
                    <span>{t("قناة واتساب", "WhatsApp channel")}</span>
                    <input value={t("واتساب", "WhatsApp")} readOnly />
                  </label>
                  <label>
                    <span>{t("النموذج", "Template")}</span>
                    <CustomSelect
                      value={form.templateName}
                      onChange={(value) => setForm((current) => ({ ...current, templateName: value }))}
                      disabled={!approvedTemplates.length}
                      options={
                        approvedTemplates.length
                          ? approvedTemplates.map((template) => ({ value: template.name, label: template.name }))
                          : [{
                              value: "",
                              label: !whatsappConnected
                                ? t("اربط قناة واتساب أولاً", "Connect a WhatsApp channel first")
                                : t("لا توجد قوالب معتمدة من Meta", "No templates approved by Meta")
                            }]
                      }
                    />
                    <small className="field-hint">{t("تظهر هنا فقط قوالب Meta التسويقية المعتمدة والجاهزة للإرسال.", "Only Meta marketing templates that are approved and ready to send appear here.")}</small>
                  </label>
                  {needsHeaderMedia ? (
                    <label>
                      <span>{t("أضف صورة أو فيديو", "Add image or video")}</span>
                      <div className="file-picker">
                        <button type="button" onClick={() => document.getElementById("campaign-header-media-input")?.click()}>{t("تصفح", "Browse")}</button>
                        <span>
                          {headerMediaFile?.name
                            || (templateHasSavedMedia
                              ? t("سيتم استخدام الصورة/الفيديو المحفوظة (اختياري: ارفع ملفاً لاستبدالها لهذه الحملة)", "The saved image/video will be used (optional: upload a file to override it for this campaign)")
                              : t("اختر صورة أو فيديو أو أسقطه هنا ...", "Choose an image or video, or drop it here..."))}
                        </span>
                        <input
                          id="campaign-header-media-input"
                          type="file"
                          accept="image/jpeg,image/png,video/mp4,video/3gpp"
                          onChange={(event) => setHeaderMediaFile(event.target.files?.[0] || null)}
                        />
                      </div>
                      <small className="field-hint">{t("الحد الأقصى 16 ميجابايت.", "Max 16MB.")}</small>
                    </label>
                  ) : null}
                  <label>
                    <span>{t("مصدر الجمهور", "Audience source")}</span>
                    <div className="section-tabs">
                      <button className={form.audienceMode === "file" ? "section-tab active" : "section-tab"} type="button" onClick={() => setAudienceMode("file")}>{t("📁 رفع ملف", "📁 Upload file")}</button>
                      <button className={form.audienceMode === "paste" ? "section-tab active" : "section-tab"} type="button" onClick={() => setAudienceMode("paste")}>{t("📋 لصق الأرقام", "📋 Paste numbers")}</button>
                      <button className={form.audienceMode === "segment" ? "section-tab active" : "section-tab"} type="button" onClick={() => setAudienceMode("segment")}>{t("🎯 تقسيم جمهور", "🎯 Segment")}</button>
                    </div>
                  </label>
                  {form.audienceMode === "paste" ? (
                    <label>
                      <span>{t("الصق أرقام العملاء", "Paste customer numbers")}</span>
                      <textarea className="paste-box" value={pastedText} onChange={(event) => handlePastedChange(event.target.value)} placeholder={"9665XXXXXXXX\n05XXXXXXXX, اسم العميل\n+9665XXXXXXXX"} />
                      <small className="field-hint">{t("رقم في كل سطر، أو عدة أرقام بينها فاصلة. يمكن كتابة الاسم بعد الرقم مفصولًا بفاصلة.", "One number per line, or several separated by commas. Add a name after the number, separated by a comma.")}</small>
                      {numbersReport ? <NumbersReport report={numbersReport} source="paste" /> : null}
                    </label>
                  ) : null}
                  {form.audienceMode === "file" ? (
                    <label>
                      <span>{t("ملف اكسل أو CSV", "Excel or CSV file")}</span>
                      <div className="file-picker">
                        <button type="button" onClick={() => document.getElementById("campaign-file-input")?.click()}>{t("تصفح", "Browse")}</button>
                        <span>{campaignFile?.name || t("اختر ملف اكسل أو CSV أو أسقطه هنا ...", "Choose an Excel or CSV file, or drop it here...")}</span>
                        <input
                          id="campaign-file-input"
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          onChange={(event) => handleCampaignFileChange(event.target.files?.[0] || null)}
                        />
                      </div>
                      <small className="field-hint">{t("يجب أن تكون أرقام العملاء في أول عمود بصيغة 966 أو +966.", "Customer numbers must be in the first column, formatted as 966 or +966.")}</small>
                      {recipientPreviewLoading ? (
                        <small className="field-hint">{t("جاري فحص الملف...", "Checking the file...")}</small>
                      ) : recipientPreviewError ? (
                        <p className="form-error">{recipientPreviewError}</p>
                      ) : numbersReport ? <NumbersReport report={numbersReport} source="file" /> : recipientPreview !== null ? (
                        <small className="field-hint">
                          {recipientPreview > 0
                            ? t(`تم العثور على ${formatNumber(recipientPreview)} رقم صحيح في الملف.`, `Found ${formatNumber(recipientPreview)} valid numbers in the file.`)
                            : t("ما لقينا أي أرقام صالحة في الملف. تأكد إن الأرقام بالعمود الأول.", "No valid numbers found in the file. Make sure numbers are in the first column.")}
                        </small>
                      ) : null}
                    </label>
                  ) : null}
                  {form.audienceMode === "segment" ? (
                    <label>
                      <span>{t("تقسيم العملاء", "Segment")}</span>
                      <CustomSelect
                        value={form.segmentId}
                        onChange={(value) => selectSegment(value)}
                        options={segments.map((segment) => ({
                          value: segment.id,
                          label: `${segment.name} (${formatNumber(segment.recipientCount)} ${t("عميل", "customers")})`
                        }))}
                      />
                      {!segments.length ? (
                        <small className="field-hint">{t("ما فيه تقسيمات عملاء بعد - أنشئ واحداً من صفحة تقسيم العملاء.", "No segments yet - create one from the Customer Segments page.")}</small>
                      ) : null}
                    </label>
                  ) : null}
                  <label className="schedule-toggle">
                    <span>{t("جدولة الحملة؟", "Schedule the campaign?")}</span>
                    <button
                      className={form.scheduled ? "toggle on" : "toggle"}
                      type="button"
                      aria-pressed={form.scheduled}
                      onClick={() => setForm((current) => ({ ...current, scheduled: !current.scheduled, scheduledAt: current.scheduled ? "" : current.scheduledAt }))}
                    />
                  </label>
                  {form.scheduled ? (
                    <label><span>{form.recurring ? t("أول إرسال", "First send") : t("تاريخ ووقت الإرسال", "Send date and time")}</span><input type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))} /></label>
                  ) : null}
                  <label className="schedule-toggle">
                    <span>🔁 {t("اجعلها متكررة", "Make it recurring")}</span>
                    <button
                      className={form.recurring ? "toggle on" : "toggle"}
                      type="button"
                      aria-pressed={form.recurring}
                      onClick={() => setForm((current) => ({ ...current, recurring: !current.recurring }))}
                    />
                  </label>
                  {form.recurring ? (
                    <>
                      <label>
                        <span>{t("تكرار كل", "Repeat every")}</span>
                        <CustomSelect
                          value={String(form.recurrenceIntervalDays)}
                          onChange={(value) => setForm((current) => ({ ...current, recurrenceIntervalDays: Number(value) }))}
                          options={recurrenceIntervalOptions.map((option) => ({ value: String(option.days), label: t(option.ar, option.en) }))}
                        />
                      </label>
                      <label><span>{t("تنتهي في (اختياري)", "Ends on (optional)")}</span><input type="date" value={form.recurrenceEndAt} onChange={(event) => setForm((current) => ({ ...current, recurrenceEndAt: event.target.value }))} /></label>
                    </>
                  ) : null}
                  {!form.recurring ? (
                    <>
                      <label className="schedule-toggle">
                        <span>🔗 {t("تفعيل تتبع الروابط لكل عميل", "Enable per-customer link tracking")}</span>
                        <button
                          className={form.linkTrackingEnabled ? "toggle on" : "toggle"}
                          type="button"
                          aria-pressed={form.linkTrackingEnabled}
                          onClick={() => setForm((current) => ({ ...current, linkTrackingEnabled: !current.linkTrackingEnabled }))}
                        />
                      </label>
                      {form.linkTrackingEnabled ? (
                        <label>
                          <span>{t("رابط الوجهة بعد الضغط", "Destination link after click")}</span>
                          <input
                            dir="ltr"
                            type="url"
                            placeholder="https://example.com"
                            value={form.destinationUrl}
                            onChange={(event) => setForm((current) => ({ ...current, destinationUrl: event.target.value }))}
                          />
                          <small>{t("آخر متغير بنص القالب سيُستبدل تلقائيًا برابط تتبع فريد لكل عميل. لو القالب فيه متغيرين، الأول يفضل لاسم العميل والثاني (الأخير) يصير الرابط.", "The last variable in the template body is automatically replaced with each customer's own unique tracking link. With two variables, the first still carries the customer's name and the last (the link) does the tracking.")}</small>
                        </label>
                      ) : null}
                    </>
                  ) : null}
                  {!approvedTemplates.length ? (
                    <p className="form-error">
                      {!whatsappConnected
                        ? t("لا يمكن إنشاء حملة قبل ربط قناة واتساب من الإعدادات.", "You can't create a campaign before connecting a WhatsApp channel from Settings.")
                        : t("لا يمكن إنشاء حملة حتى تتم مزامنة قالب تسويقي معتمد من Meta.", "You can't create a campaign until an approved Meta marketing template has been synced.")}
                    </p>
                  ) : null}
                </>
              ) : null}
              {formError ? <p className="form-error">{formError}</p> : null}
            </div>
            <aside className="campaign-live-preview" aria-label={t("معاينة الحملة", "Campaign preview")}>
              <div className="campaign-preview-title"><span>{t("معاينة مباشرة", "Live preview")}</span><small>{t("شكل تقريبي للرسالة", "Approximate message appearance")}</small></div>
              <div className="campaign-phone"><div className="campaign-phone-bar"><span>{brandName}</span><i>•••</i></div><div className="campaign-phone-notice">{t("محادثة أعمال موثقة وآمنة", "Verified and secure business chat")}</div><div className="campaign-message-preview"><b>{form.name || t("اسم الحملة", "Campaign name")}</b><p>{approvedTemplates.find((template) => template.name === form.templateName)?.message || t("اختر قالباً معتمداً لتظهر معاينة نص الرسالة هنا.", "Choose an approved template to preview its message here.")}</p><time>3:34 PM</time></div></div>
              <dl><div><dt>{t("الجمهور", "Audience")}</dt><dd>{recipientPreview === null ? "—" : formatNumber(recipientPreview)}</dd></div><div><dt>{t("طريقة الإرسال", "Delivery")}</dt><dd>{form.scheduled ? t("مجدولة", "Scheduled") : t("فوري", "Immediate")}</dd></div>{form.recurring ? <div><dt>{t("التكرار", "Repeats")}</dt><dd>{t(recurrenceIntervalOptions.find((option) => option.days === form.recurrenceIntervalDays)?.ar || "", recurrenceIntervalOptions.find((option) => option.days === form.recurrenceIntervalDays)?.en || "")}</dd></div> : null}</dl>
            </aside>
            {!form.id && recipientPreview ? (
              <div className={`campaign-cost-estimate${!balanceLoading && !balanceLoadError && balance < recipientPreview ? " is-short" : ""}`} role={!balanceLoading && !balanceLoadError && balance < recipientPreview ? "alert" : "status"}>
                <div>
                  <strong>{t(`تحتاج ${formatNumber(recipientPreview)} رسالة`, `This needs ${formatNumber(recipientPreview)} messages`)}</strong>
                  <small>{balanceLoading ? t("جارٍ قراءة الرصيد…", "Reading your balance…") : balanceLoadError ? t("تعذر قراءة الرصيد", "Could not read your balance") : t(`رصيدك ${formatNumber(balance)} رسالة`, `your balance is ${formatNumber(balance)} messages`)}</small>
                  {!balanceLoading && !balanceLoadError && balance < recipientPreview ? <p>{t(`رصيدك لا يكفي. ينقصك ${(recipientPreview - balance).toLocaleString("en-US")} رسالة، وسيتوقف الإرسال عند نفاد الرصيد.`, `Your balance is not enough: you are short by ${(recipientPreview - balance).toLocaleString("en-US")} messages and sending stops when it runs out.`)}</p> : null}
                </div>
                {!balanceLoading && !balanceLoadError && balance < recipientPreview ? <button className="btn primary" type="button" onClick={() => { setFormOpen(false); setActiveTab("balance"); openTopUp(recipientPreview - balance); }}>{t("شحن الرصيد", "Top up balance")}</button> : null}
              </div>
            ) : null}
            <footer className="modal-foot"><button className="btn soft" type="button" onClick={() => void requestCloseForm()}>{t("إلغاء", "Cancel")}</button><button className="btn primary" type="submit" disabled={saving || (!form.id && (!approvedTemplates.length || (form.audienceMode === "file" ? !campaignFile : !form.segmentId) || !recipientPreview || (needsHeaderMedia && !templateHasSavedMedia && !headerMediaFile)))}>{saving ? t("جاري الحفظ", "Saving") : form.id ? t("حفظ", "Save") : form.recurring ? t("جدولة حملة متكررة", "Schedule recurring campaign") : form.scheduled ? t("جدولة الحملة", "Schedule campaign") : t("إرسال الحملة", "Send campaign")}</button></footer>
          </form>
        </div>
      ) : null}

      {reportCampaign ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setReportCampaign(null)}>
          <div className="account-modal campaign-report-modal" role="dialog" aria-modal="true" aria-label={t(`تقرير الحملة ${reportCampaign.name}`, `Campaign report for ${reportCampaign.name}`)} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setReportCampaign(null)}>×</button>
              <h2>{t("تقرير الحملة", "Campaign report")} - {reportCampaign.name}</h2>
            </header>
            <CampaignEngagementReport campaignId={reportCampaign.id} campaignName={reportCampaign.name} />
            <footer className="modal-foot"><button className="btn primary" type="button" onClick={() => setReportCampaign(null)}>{t("حسنًا", "OK")}</button></footer>
          </div>
        </div>
      ) : null}

      {chargeOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setChargeOpen(false)}>
          <div className="account-modal balance-modal" role="dialog" aria-modal="true" aria-label={t("شحن رصيد الحملات", "Top up campaign balance")} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setChargeOpen(false)}>×</button>
              <h2>{t("شحن رصيد الحملات", "Top up campaign balance")}</h2>
            </header>
            <div className="account-modal-body balance-modal-body">
              <div className="balance-selected-package">
                <span>{t("الرصيد المطلوب", "Requested balance")}</span>
                <b>{formatNumber(parsedChargeMessages)} {t("رسالة", "messages")}</b>
                <strong>{chargeTier ? t(`${formatCurrency(chargeTier.rate, "ar")} لكل رسالة`, `${formatCurrency(chargeTier.rate, "en")} per message`) : t("أدخل رسالة واحدة أو أكثر", "Enter 1 message or more")}</strong>
              </div>
              <label>
                <span>{t("عدد رسائل الحملات", "Number of campaign messages")}</span>
                <input
                  inputMode="numeric"
                  min="1"
                  value={chargeMessages}
                  onChange={(event) => setChargeMessages(event.target.value)}
                  placeholder={t("مثال: 5000", "Example: 5000")}
                />
              </label>
              <div className="charge-presets" aria-label={t("اختيارات سريعة للشحن", "Quick top-up options")}>
                {[100, 500, 1000, 5000, 10000, 25000, 50000, 100000].map((value) => (
                  <button key={value} type="button" onClick={() => setChargeMessages(String(value))}>
                    {formatNumber(value)} {t("رسالة", "messages")}
                  </button>
                ))}
              </div>
              <div className="charge-calculator">
                <div><span>{t("الشريحة", "Tier")}</span><b>{chargeTier ? pricingRangeLabel(chargeTier.range, language) : t("غير محددة", "Not set")}</b></div>
                <div><span>{t("سعر الرسالة", "Price per message")}</span><b>{chargeTier ? formatCurrency(chargeTier.rate, language) : "-"}</b></div>
                <div><span>{t("إجمالي الشحن", "Total top-up")}</span><b>{chargeTier ? formatCurrency(chargeTotal, language) : "-"}</b></div>
              </div>
              <p style={{ color: "#d92d20", fontWeight: 800, fontSize: 13 }}>{t("الأسعار غير شاملة ضريبة القيمة المضافة (15%)، وتُضاف عند صفحة الدفع.", "Prices exclude VAT. 15% VAT is added on the payment page.")}</p>
              <p className="field-hint">{t('بالضغط على "إنشاء طلب الشحن" بتنفتح لك صفحة دفع آمنة من Moyasar لإتمام العملية ببطاقتك. الرصيد ينضاف تلقائيًا بعد نجاح الدفع.', 'Clicking "Create top-up request" opens a secure Moyasar payment page to complete the transaction with your card. The balance is added automatically once payment succeeds.')}</p>
              {chargeError ? <p className="form-error">{chargeError}</p> : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setChargeOpen(false)}>{t("إلغاء", "Cancel")}</button>
              <button className="btn primary" type="button" disabled={!chargeTier || chargeSubmitting} onClick={createChargeRequest}>{chargeSubmitting ? t("جارٍ التجهيز...", "Preparing...") : t("إنشاء طلب الشحن", "Create top-up request")}</button>
            </footer>
          </div>
        </div>
      ) : null}

      {pricingOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setPricingOpen(false)}>
          <div className="account-modal pricing-modal" role="dialog" aria-modal="true" aria-label={t("أسعار الرسائل التسويقية", "Marketing message pricing")} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setPricingOpen(false)}>×</button>
              <h2>{t("أسعار الرسائل التسويقية", "Marketing message pricing")}</h2>
            </header>
            <div className="account-modal-body">
              <div className="pricing-card pricing-table-card">
                <div className="pricing-intro"><span>{t("تسعير مرن", "FLEXIBLE PRICING")}</span><h3>{t("كلما زاد حجم الإرسال، انخفض سعر الرسالة", "The larger the volume, the lower the message price")}</h3><p>{t("اختر الشريحة المناسبة لحجم حملتك، ويُحسب الإجمالي تلقائياً عند شحن الرصيد.", "Choose the tier matching your campaign volume; the total is calculated automatically during top-up.")}</p></div>
                <div className="pricing-table" role="table" aria-label={t("شرائح أسعار الرسائل", "Message pricing tiers")}>
                  <div className="pricing-table-head" role="row"><span>{t("حجم الرسائل", "Message volume")}</span><span>{t("سعر الرسالة", "Price per message")}</span><span>{t("التوفير", "Saving")}</span></div>
                  {marketingMessagePrices.map((tier) => (
                    <div className="pricing-tier-row" role="row" key={tier.range}><span>{pricingRangeLabel(tier.range, language)}</span><b>{formatCurrency(tier.rate, language)}</b><em>{Math.round((1 - tier.rate / marketingMessagePrices[0].rate) * 100)}%</em></div>
                  ))}
                </div>
                <div className="pricing-note"><span>i</span><p>{t("الأسعار المعروضة خاصة برصيد Linkly ولا تشمل رسوم واتساب أو أي رسوم خارجية تفرضها Meta.", "Displayed prices cover Linkly balance only and exclude WhatsApp or other external Meta fees.")}</p></div>
              </div>
            </div>
            <footer className="modal-foot"><button className="btn primary" type="button" onClick={() => setPricingOpen(false)}>{t("حسنًا", "OK")}</button></footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 10;
  const totalPages = Math.max(1, Math.ceil(items.length / safePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * safePageSize;

  return {
    items: items.slice(start, start + safePageSize),
    page: safePage,
    totalPages
  };
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="campaign-pages">
      <button type="button" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>‹</button>
      <button className="active" type="button">{currentPage}</button>
      <button type="button" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>›</button>
    </div>
  );
}

function findMarketingMessageTier(messages: number) {
  return marketingMessagePrices.find((tier) => messages >= tier.min && messages <= tier.max) ?? null;
}

function formatCurrency(value: number, language: string = "ar") {
  const currencyLabel = language === "en" ? "SAR" : "ريال";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 3 })} ${currencyLabel}`;
}

function formatBalanceMovement(value: number) {
  const sign = value > 0 ? "+" : "-";
  return `${sign} ${Math.abs(value).toLocaleString("en-US")}`;
}
