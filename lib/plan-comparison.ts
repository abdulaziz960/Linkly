// The feature-by-plan table shown on the landing page. The rows mirror what
// lib/plan-access.ts actually enforces (a test keeps the two in sync), while
// the first few rows (price, users, channels, message allowance, AI) are
// built from the live Plan rows so an admin's edit shows up immediately.

import { PLAN_ORDER, isViewLockedForPlan, type PlanLimitKind } from "./plan-access";
import { channelLabel, parseAllowedChannels, type ChannelKey } from "./channel-catalog";
import { isUnlimitedMessageQuota, messageQuotaLabel } from "./message-quota";
import type { ViewKey } from "../app/dashboard/types";

/** true = included, false = not included, string = included with this note (a limit, a lighter version...). */
export type ComparisonCell = boolean | { ar: string; en: string };

export type ComparisonRow = {
  ar: string;
  en: string;
  /** Section sub-heading row (no cells). */
  heading?: boolean;
  /** One cell per plan, in PLAN_ORDER. */
  cells?: ComparisonCell[];
  /** The dashboard section this row is about - lets a test check it against plan-access. */
  view?: ViewKey;
  /** Marks a row whose cells come from the live Plan row instead of this file. */
  live?: "users" | "campaigns" | "ai";
  /** A channel row: included when the live Plan row allows that channel. */
  channel?: ChannelKey;
};

const yes = true;
const no = false;
const note = (ar: string, en: string): ComparisonCell => ({ ar, en });

// The channels worth listing, in the order a customer cares about them (the website chat widget is on every plan, so it's not a row).
const CHANNEL_ROW_KEYS: ChannelKey[] = ["whatsapp", "instagram", "telegram", "email", "facebook", "google_maps", "meta_leads", "tiktok", "youtube", "linkedin", "snapchat", "sms", "x"];
const CHANNEL_ROWS: ComparisonRow[] = CHANNEL_ROW_KEYS.map((key) => ({ ar: channelLabel(key, "ar"), en: channelLabel(key, "en"), channel: key }));

export const COMPARISON_ROWS: ComparisonRow[] = [
  { ar: "الأساسيات", en: "Essentials", heading: true },
  { ar: "المستخدمون", en: "Users", live: "users" },
  { ar: "صندوق المحادثات الموحّد", en: "Shared inbox", view: "inbox", cells: [yes, yes, yes, yes, yes] },
  { ar: "العملاء", en: "Customers", view: "contacts", cells: [yes, yes, yes, yes, yes] },
  { ar: "الوسوم", en: "Tags", view: "tags", cells: [yes, yes, yes, yes, yes] },
  { ar: "الردود السريعة", en: "Quick replies", view: "quickReplies", cells: [yes, yes, yes, yes, yes] },
  { ar: "رسالة ترحيب لفتح المحادثة بعد 24 ساعة", en: "Welcome message to re-open a chat after 24h", cells: [yes, yes, yes, yes, yes] },

  { ar: "القنوات", en: "Channels", heading: true },
  ...CHANNEL_ROWS,

  { ar: "الرد الآلي", en: "Auto-reply", heading: true },
  { ar: "الرد الآلي", en: "Auto-reply bot", view: "bot", cells: [note("بسيط (حتى 6 خطوات)", "Simple (up to 6 steps)"), note("حتى 15 خطوة", "Up to 15 steps"), note("غير محدود", "Unlimited"), note("غير محدود", "Unlimited"), note("غير محدود", "Unlimited")] },
  { ar: "ساعات العمل والرد خارج الدوام", en: "Work hours and off-hours reply", view: "workHours", cells: [no, yes, yes, yes, yes] },
  { ar: "مساعد الذكاء الاصطناعي", en: "AI assistant", live: "ai" },
  { ar: "قاعدة المعرفة", en: "Knowledge base", view: "knowledgeBase", cells: [no, no, note("حتى 50 مدخلًا", "Up to 50 entries"), note("حتى 200 مدخل", "Up to 200 entries"), note("غير محدود", "Unlimited")] },

  { ar: "الفريق والتشغيل", en: "Team and operations", heading: true },
  { ar: "الفرق وتوزيع المحادثات", en: "Teams and routing", view: "teams", cells: [no, note("فريقان", "2 teams"), yes, yes, yes] },
  { ar: "تصعيد المحادثات غير المجاب عليها", en: "Escalation of unanswered chats", cells: [no, note("30 دقيقة ثابتة", "Fixed 30 min"), note("مدة قابلة للتعديل", "Adjustable"), note("مدة قابلة للتعديل", "Adjustable"), note("مدة قابلة للتعديل", "Adjustable")] },
  { ar: "الأتمتة وقواعد التحويل", en: "Automation and routing rules", view: "automations", cells: [no, no, yes, yes, yes] },
  { ar: "مركز العمليات", en: "Operations center", view: "operations", cells: [no, no, yes, yes, yes] },
  { ar: "التقارير", en: "Reports", view: "reports", cells: [note("أساسي", "Basic"), note("أساسي", "Basic"), note("كامل (موظفون وفرق وSLA)", "Full (agents, teams, SLA)"), note("كامل + تصدير Excel", "Full + Excel export"), note("كامل + تصدير Excel", "Full + Excel export")] },

  { ar: "التسويق والمبيعات", en: "Marketing and sales", heading: true },
  { ar: "القوالب", en: "Templates", view: "templates", cells: [no, yes, yes, yes, yes] },
  { ar: "الحملات التسويقية", en: "Marketing campaigns", view: "campaigns", live: "campaigns" },
  { ar: "حملات متكررة بجدولة", en: "Scheduled recurring campaigns", cells: [no, no, yes, yes, yes] },
  { ar: "تقسيم العملاء", en: "Customer segments", view: "segments", cells: [no, note("بالوسوم", "By tags"), note("متقدم (تفاعل الحملات)", "Advanced (campaign engagement)"), note("متقدم", "Advanced"), note("متقدم", "Advanced")] },
  { ar: "كانبان المبيعات", en: "Sales pipeline", view: "pipeline", cells: [no, yes, yes, yes, yes] },
  { ar: "إرسال أقرب فرع للعميل حسب موقعه", en: "Send the customer their nearest branch", view: "branches", cells: [no, note("حتى 3 فروع", "Up to 3 branches"), note("حتى 7 فروع", "Up to 7 branches"), note("حتى 15 فرعًا", "Up to 15 branches"), note("غير محدود", "Unlimited")] },
  { ar: "كتالوج المنتجات والشراء من واتساب", en: "Product catalog and buying on WhatsApp", view: "catalog", cells: [no, no, no, note("حتى 300 منتج", "Up to 300 products"), note("غير محدود", "Unlimited")] },

  { ar: "للمطورين والمؤسسات", en: "Developers and enterprise", heading: true },
  { ar: "التكاملات", en: "Integrations", view: "integrations", cells: [no, no, no, yes, yes] },
  { ar: "واجهة API وWebhooks", en: "API and webhooks", view: "developers", cells: [no, no, no, yes, yes] },
  { ar: "علامة تجارية مخصّصة (White-label)", en: "Custom white-label branding", view: "branding", cells: [no, no, no, no, yes] }
];

export type ComparisonPlan = {
  name: string;
  monthlyPrice: number;
  employeeLimit: number;
  allowedChannels: string;
  messageQuota: number;
  aiDailyLimit: number;
};

/** The five tiers in display order (custom admin-created plans aren't part of the comparison). */
export function orderComparisonPlans<T extends { name: string }>(plans: T[]): T[] {
  return PLAN_ORDER.map((name) => plans.find((plan) => plan.name === name)).filter((plan): plan is T => Boolean(plan));
}

/** Whether the live Plan row lets this plan connect the channel. */
export function channelCell(channel: ChannelKey, plan: ComparisonPlan): boolean {
  const channels = parseAllowedChannels(plan.allowedChannels);
  return channels === "*" || channels.includes(channel);
}

export function liveCell(kind: NonNullable<ComparisonRow["live"]>, plan: ComparisonPlan): ComparisonCell {
  if (kind === "users") return { ar: `${plan.employeeLimit} مستخدم`, en: `${plan.employeeLimit} users` };
  if (kind === "ai") {
    if (plan.aiDailyLimit > 0) return { ar: `${plan.aiDailyLimit} طلب يوميًا`, en: `${plan.aiDailyLimit} requests/day` };
    // No managed allowance, but the section is open: the customer connects their own API key.
    return isViewLockedForPlan(plan.name, "ai") ? false : { ar: "بربط مفتاحك الخاص", en: "With your own API key" };
  }
  // campaigns: a plan without the campaigns section has no marketing allowance to show
  if (isViewLockedForPlan(plan.name, "campaigns") || plan.messageQuota <= 0) return false;
  return isUnlimitedMessageQuota(plan.messageQuota)
    ? { ar: "رسائل غير محدودة", en: "Unlimited messages" }
    : { ar: `${messageQuotaLabel(plan.messageQuota, "ar")} رسالة شهريًا`, en: `${messageQuotaLabel(plan.messageQuota, "en")} messages/month` };
}

export type { PlanLimitKind };
