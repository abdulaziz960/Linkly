// The feature-by-plan table shown on the landing page. The rows mirror what
// lib/plan-access.ts actually enforces (a test keeps the two in sync), while
// the first few rows (price, users, channels, message allowance, AI) are
// built from the live Plan rows so an admin's edit shows up immediately.

import { PLAN_ORDER, isViewLockedForPlan, type PlanLimitKind } from "./plan-access";
import { channelLabel, parseAllowedChannels, type ChannelKey } from "./channel-catalog";
import { isUnlimitedMessageQuota, messageQuotaLabel } from "./message-quota";
import { BY_AGREEMENT, planFeatures, usersLabel } from "./plan-features";
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

/**
 * What each channel actually does in Linkly, shown under its name in the
 * table, so "Instagram ✓" never reads as more (or less) than it is. Keep in
 * step with the inbox code (lib/*-inbox.ts) when a channel gains a feature.
 */
export const CHANNEL_CAPABILITY: Partial<Record<ChannelKey, { ar: string; en: string }>> = {
  whatsapp: { ar: "رسائل وقوالب وحملات", en: "Messages, templates, campaigns" },
  instagram: { ar: "رسائل خاصة وتعليقات", en: "DMs and comments" },
  telegram: { ar: "رسائل البوت", en: "Bot messages" },
  email: { ar: "إرسال واستلام (Gmail)", en: "Send and receive (Gmail)" },
  facebook: { ar: "رسائل الصفحة", en: "Page messages" },
  google_maps: { ar: "تقييمات العملاء والرد عليها", en: "Customer reviews and replies" },
  meta_leads: { ar: "نماذج العملاء المحتملين", en: "Lead forms" },
  tiktok: { ar: "بانتظار اعتماد تيك توك لواجهة الرسائل", en: "Pending TikTok messaging approval" },
  youtube: { ar: "تعليقات الفيديو", en: "Video comments" },
  linkedin: { ar: "تعليقات المنشورات", en: "Post comments" },
  snapchat: { ar: "نماذج العملاء المحتملين", en: "Lead forms" },
  sms: { ar: "إرسال فقط", en: "Sending only" },
  x: { ar: "رسائل خاصة وإشارات", en: "DMs and mentions" }
};

/**
 * Channels a plan may list but that cannot be connected yet: TikTok's
 * Business Messaging API needs partner approval (app/api/tiktok/webhook
 * answers 501 until then). Shown as "coming soon" instead of a check mark.
 */
export const PENDING_CHANNELS: ChannelKey[] = ["tiktok"];
const SOON = { ar: "قريبًا", en: "Coming soon" } as const;

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
  { ar: "قالب واتساب معتمد لمتابعة العميل بعد انتهاء نافذة الخدمة (24 ساعة)", en: "Approved WhatsApp template to follow up after the 24-hour service window", cells: [yes, yes, yes, yes, yes] },

  { ar: "القنوات", en: "Channels", heading: true },
  ...CHANNEL_ROWS,

  { ar: "الرد الآلي", en: "Auto-reply", heading: true },
  { ar: "الرد الآلي", en: "Auto-reply bot", view: "bot", cells: [note("بسيط (حتى 6 خطوات)", "Simple (up to 6 steps)"), note("حتى 15 خطوة", "Up to 15 steps"), note("غير محدود", "Unlimited"), note("غير محدود", "Unlimited"), note("غير محدود", "Unlimited")] },
  { ar: "ساعات العمل والرد خارج الدوام", en: "Work hours and off-hours reply", view: "workHours", cells: [no, yes, yes, yes, yes] },
  { ar: "مساعد الذكاء الاصطناعي", en: "AI assistant", live: "ai" },
  { ar: "قاعدة المعرفة", en: "Knowledge base", view: "knowledgeBase", cells: [no, no, note("حتى 50 مدخلًا", "Up to 50 entries"), note("حتى 200 مدخل", "Up to 200 entries"), BY_AGREEMENT] },

  { ar: "الفريق والتشغيل", en: "Team and operations", heading: true },
  { ar: "الفرق وتوزيع المحادثات", en: "Teams and routing", view: "teams", cells: [no, note("فريقان", "2 teams"), yes, yes, yes] },
  { ar: "تصعيد المحادثات غير المجاب عليها", en: "Escalation of unanswered chats", cells: [no, note("30 دقيقة ثابتة", "Fixed 30 min"), note("مدة قابلة للتعديل", "Adjustable"), note("مدة قابلة للتعديل", "Adjustable"), note("مدة قابلة للتعديل", "Adjustable")] },
  { ar: "الأتمتة وقواعد التحويل", en: "Automation and routing rules", view: "automations", cells: [no, no, yes, yes, yes] },
  { ar: "مركز العمليات", en: "Operations center", view: "operations", cells: [no, no, yes, yes, yes] },
  { ar: "التقارير", en: "Reports", view: "reports", cells: [note("أساسي", "Basic"), note("أساسي", "Basic"), note("كامل (موظفون وفرق وSLA)", "Full (agents, teams, SLA)"), note("كامل + تصدير Excel", "Full + Excel export"), note("كامل + تصدير Excel", "Full + Excel export")] },

  { ar: "التسويق والمبيعات", en: "Marketing and sales", heading: true },
  { ar: "القوالب", en: "Templates", view: "templates", cells: [yes, yes, yes, yes, yes] },
  { ar: "الحملات التسويقية", en: "Marketing campaigns", view: "campaigns", live: "campaigns" },
  { ar: "حملات متكررة بجدولة", en: "Scheduled recurring campaigns", cells: [no, no, yes, yes, yes] },
  { ar: "تقسيم العملاء", en: "Customer segments", view: "segments", cells: [no, note("بالوسوم", "By tags"), note("متقدم (تفاعل الحملات)", "Advanced (campaign engagement)"), note("متقدم", "Advanced"), note("متقدم", "Advanced")] },
  { ar: "إرسال أحداث التحويل لمنصات الإعلانات (تحسين الحملات)", en: "Conversion events to ad platforms (campaign optimisation)", cells: [no, no, note("ميتا فقط", "Meta only"), note("ميتا وسناب شات وتيك توك", "Meta, Snapchat and TikTok"), note("ميتا وسناب شات وتيك توك", "Meta, Snapchat and TikTok")] },
  { ar: "تكامل سلة: الطلبات والسلات المتروكة وإشعارات واتساب", en: "Salla integration: orders, abandoned carts and WhatsApp updates", cells: [yes, yes, yes, yes, yes] },
  { ar: "تكامل زد (منتجات وطلبات وكوبونات)", en: "Zid integration (products, orders, coupons)", cells: [no, no, no, SOON, SOON] },
  { ar: "تكامل شوبيفاي (منتجات وطلبات)", en: "Shopify integration (products and orders)", cells: [no, no, no, SOON, SOON] },
  { ar: "إرسال أقرب فرع للعميل حسب موقعه", en: "Send the customer their nearest branch", view: "branches", cells: [no, note("حتى 30 فرعًا", "Up to 30 branches"), note("حتى 65 فرعًا", "Up to 65 branches"), note("حتى 100 فرع", "Up to 100 branches"), BY_AGREEMENT] },
  { ar: "كتالوج المنتجات والشراء من واتساب", en: "Product catalog and buying on WhatsApp", view: "catalog", cells: [no, no, no, note("حتى 300 منتج", "Up to 300 products"), BY_AGREEMENT] },

  { ar: "للمطورين والمؤسسات", en: "Developers and enterprise", heading: true },
  { ar: "تكاملات منصات الإعلانات (استقبال العملاء المحتملين)", en: "Ad-platform integrations (receiving leads)", cells: [no, no, no, yes, yes] },
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

/** Whether the live Plan row lets this plan connect the channel ("coming soon" for a channel that can't be connected yet). */
export function channelCell(channel: ChannelKey, plan: ComparisonPlan): ComparisonCell {
  const channels = parseAllowedChannels(plan.allowedChannels);
  const included = channels === "*" || channels.includes(channel);
  return included && PENDING_CHANNELS.includes(channel) ? SOON : included;
}

export function liveCell(kind: NonNullable<ComparisonRow["live"]>, plan: ComparisonPlan): ComparisonCell {
  // A quote-based plan's limits are set per customer (Subscription.employeeLimit etc.), so the plan row's numbers are only defaults.
  const quoteBased = Boolean(planFeatures[plan.name]?.custom);
  if (kind === "users") return quoteBased ? BY_AGREEMENT : { ar: usersLabel(plan.employeeLimit, "ar"), en: usersLabel(plan.employeeLimit, "en") };
  if (kind === "ai") {
    if (quoteBased) return BY_AGREEMENT;
    if (plan.aiDailyLimit > 0) return { ar: `${plan.aiDailyLimit} طلب يوميًا`, en: `${plan.aiDailyLimit} requests/day` };
    // No managed allowance, but the section is open: the customer connects their own API key.
    return isViewLockedForPlan(plan.name, "ai") ? false : { ar: "بربط مفتاحك الخاص", en: "With your own API key" };
  }
  // campaigns: a plan without the campaigns section has no marketing allowance to show.
  // Unlimited (-1) is checked first: it is below zero but is the largest allowance, not none.
  if (isViewLockedForPlan(plan.name, "campaigns")) return false;
  if (isUnlimitedMessageQuota(plan.messageQuota)) return { ar: "رسائل غير محدودة", en: "Unlimited messages" };
  if (plan.messageQuota <= 0) return false;
  return { ar: `${messageQuotaLabel(plan.messageQuota, "en")} رسالة شهريًا`, en: `${messageQuotaLabel(plan.messageQuota, "en")} messages/month` };
}

export type { PlanLimitKind };
