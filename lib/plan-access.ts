// Per-plan feature access (isomorphic - no Prisma import, so client
// components can use it). Channel restrictions live on the Plan row
// (allowedChannels); this file holds everything else a plan can restrict:
// which dashboard sections are open, how rich the auto-reply may be, and
// whether reports are the basic version.
//
// Only plans listed in RESTRICTED_PLANS are limited. Every other plan (and a
// tenant with no/unknown plan) stays fully open, so tightening one tier never
// affects the others - add an entry here to restrict another tier later.

import { allViewKeys } from "./permissions";
import { channelLabel, parseAllowedChannels, type AllowedChannels, type ChannelKey } from "./channel-catalog";
import type { ViewKey } from "../app/dashboard/types";

export type PlanRestriction = {
  /** Dashboard sections this plan may open - everything else is locked. */
  views: ViewKey[];
  /** Auto-reply step types this plan may use ("*" = all). */
  botNodeTypes: string[] | "*";
  /** Maximum number of auto-reply steps (null = no cap). */
  botMaxSteps: number | null;
  /** Reports show the basic summary only (no employee/team/AI/conversion analytics). */
  basicReports: boolean;
  /** Unanswered-conversation escalation (SLA alerts to the owner/team lead). */
  escalation: boolean;
};

export const INDIVIDUALS_PLAN = "باقة الأفراد";
export const REGULAR_PLAN = "الباقة العادية";
export const SMALL_ORG_PLAN = "باقة المؤسسات الصغيرة";
export const LARGE_ORG_PLAN = "باقة المؤسسات الكبيرة";
export const ENTERPRISE_PLAN = "باقة الشركات";

/** Cheapest first - an upgrade prompt points to the first plan that has what's locked. */
export const PLAN_ORDER = [INDIVIDUALS_PLAN, REGULAR_PLAN, SMALL_ORG_PLAN, LARGE_ORG_PLAN, ENTERPRISE_PLAN];

const INDIVIDUALS_VIEWS: ViewKey[] = ["inbox", "contacts", "tags", "quickReplies", "bot", "reports", "settings", "employees"];
const REGULAR_VIEWS: ViewKey[] = [...INDIVIDUALS_VIEWS, "teams", "workHours", "templates", "campaigns", "segments", "pipeline", "catalog", "branches"];
const SMALL_ORG_VIEWS: ViewKey[] = [...REGULAR_VIEWS, "automations", "ai", "knowledgeBase", "operations"];
const LARGE_ORG_VIEWS: ViewKey[] = [...SMALL_ORG_VIEWS, "developers", "integrations"];

// What the plan's AI-free bot may use. The AI and Knowledge Base steps arrive with the AI assistant (small enterprises).
const BOT_STEPS_WITHOUT_AI = ["إرسال رسالة", "إرسال قائمة قصيرة", "إرسال قائمة طويلة", "عرض الكتالوج", "أقرب فرع", "تحويل لفريق", "تحويل لموظف", "إغلاق المحادثة"];

// Only the plans listed here are limited, each to exactly its own features.
// Enterprise (and any unknown/custom plan) is fully open. Channels are
// restricted separately by the Plan row's allowedChannels.
export const RESTRICTED_PLANS: Record<string, PlanRestriction> = {
  [INDIVIDUALS_PLAN]: {
    // WhatsApp inbox, customers, tags, quick replies, a simple bot, basic
    // reports - plus settings (to connect WhatsApp) and the employees page
    // (to see the single-user limit and upgrade).
    views: INDIVIDUALS_VIEWS,
    botNodeTypes: ["إرسال رسالة", "إرسال قائمة قصيرة", "تحويل لموظف", "إغلاق المحادثة"],
    botMaxSteps: 6,
    basicReports: true,
    // A single-user plan has nobody to escalate to.
    escalation: false
  },
  [REGULAR_PLAN]: {
    views: REGULAR_VIEWS,
    botNodeTypes: BOT_STEPS_WITHOUT_AI,
    botMaxSteps: null,
    basicReports: true,
    escalation: true
  },
  [SMALL_ORG_PLAN]: {
    views: SMALL_ORG_VIEWS,
    botNodeTypes: "*",
    botMaxSteps: null,
    basicReports: false,
    escalation: true
  },
  [LARGE_ORG_PLAN]: {
    views: LARGE_ORG_VIEWS,
    botNodeTypes: "*",
    botMaxSteps: null,
    basicReports: false,
    escalation: true
  }
};

// Channel availability mirrors the plans' allowedChannels (lib/database.ts seed):
// WhatsApp from the first plan, Instagram from the regular plan, TikTok from the large one, everything else enterprise.
const CHANNEL_MIN_PLAN: Partial<Record<ChannelKey, string>> = {
  whatsapp: INDIVIDUALS_PLAN,
  instagram: REGULAR_PLAN,
  tiktok: LARGE_ORG_PLAN
};

/** The cheapest plan that includes a section. */
export function upgradeTargetForView(view: ViewKey): string {
  const plan = PLAN_ORDER.find((name) => (RESTRICTED_PLANS[name] ? RESTRICTED_PLANS[name].views.includes(view) : true));
  return plan ?? ENTERPRISE_PLAN;
}

export function upgradeTargetForChannel(channel: ChannelKey): string {
  return CHANNEL_MIN_PLAN[channel] ?? ENTERPRISE_PLAN;
}

/** The cheapest plan whose bot may use a step type. */
export function upgradeTargetForBotStep(stepType: string): string {
  const plan = PLAN_ORDER.find((name) => {
    const restriction = RESTRICTED_PLANS[name];
    return !restriction || restriction.botNodeTypes === "*" || restriction.botNodeTypes.includes(stepType);
  });
  return plan ?? ENTERPRISE_PLAN;
}

export function getPlanRestriction(planName: string | null | undefined): PlanRestriction | null {
  return planName ? RESTRICTED_PLANS[planName] ?? null : null;
}

export function lockedViewsForPlan(planName: string | null | undefined): ViewKey[] {
  const restriction = getPlanRestriction(planName);
  if (!restriction) return [];
  return allViewKeys.filter((view) => !restriction.views.includes(view));
}

export function isEscalationAllowedForPlan(planName: string | null | undefined): boolean {
  return getPlanRestriction(planName)?.escalation ?? true;
}

export function isViewLockedForPlan(planName: string | null | undefined, view: ViewKey): boolean {
  const restriction = getPlanRestriction(planName);
  return restriction ? !restriction.views.includes(view) : false;
}

export function upgradeMessageForView(view: ViewKey, label: string): string {
  return `ميزة «${label}» غير متاحة في باقتك الحالية، وهي متاحة بدءًا من ${upgradeTargetForView(view)}. رقِّ باقتك للاستمتاع بالمزايا.`;
}

export function upgradeMessageForChannel(channel: ChannelKey): string {
  return `باقتك لا تدعم الربط مع منصة ${channelLabel(channel)}، وهي متاحة بدءًا من ${upgradeTargetForChannel(channel)}. رقِّ باقتك للاستمتاع بالمزايا.`;
}

/** Serializable snapshot the dashboard reads (server computes it once per page load). */
export type PlanAccessData = {
  planName: string;
  lockedViews: ViewKey[];
  allowedChannels: AllowedChannels;
  botNodeTypes: string[] | "*";
  botMaxSteps: number | null;
  basicReports: boolean;
  /** Still on the free trial - the upgrade popup then offers to try the plan instead of paying. */
  isTrial: boolean;
};

export function buildPlanAccess(planName: string | null | undefined, allowedChannelsRaw: string | null | undefined, isTrial = false): PlanAccessData {
  const restriction = getPlanRestriction(planName);
  return {
    planName: planName ?? "",
    lockedViews: lockedViewsForPlan(planName),
    allowedChannels: allowedChannelsRaw ? parseAllowedChannels(allowedChannelsRaw) : "*",
    botNodeTypes: restriction ? restriction.botNodeTypes : "*",
    botMaxSteps: restriction ? restriction.botMaxSteps : null,
    basicReports: restriction?.basicReports ?? false,
    isTrial
  };
}

/**
 * Checks a bot flow against a plan. Only steps that are NEW (not already in
 * `existing`) are judged, so a customer who already built a richer bot
 * before the plan was tightened keeps it working and can still edit it.
 */
export function validateBotNodesForPlan(
  planName: string | null | undefined,
  nodes: Array<{ id?: string; type: string }>,
  existing: Array<{ id: string; type: string }>
): { ok: true } | { ok: false; error: string } {
  const restriction = getPlanRestriction(planName);
  if (!restriction) return { ok: true };

  const existingTypeById = new Map(existing.map((node) => [node.id, node.type]));
  for (const node of nodes) {
    const isNewOrChanged = !node.id || existingTypeById.get(node.id) !== node.type;
    if (isNewOrChanged && restriction.botNodeTypes !== "*" && !restriction.botNodeTypes.includes(node.type)) {
      return { ok: false, error: `خطوة «${node.type}» غير متاحة في باقتك الحالية. رقِّ باقتك للاستمتاع بالمزايا.` };
    }
  }
  if (restriction.botMaxSteps !== null && nodes.length > restriction.botMaxSteps && nodes.length > existing.length) {
    return { ok: false, error: `الرد الآلي في باقتك الحالية يدعم حتى ${restriction.botMaxSteps} خطوات. رقِّ باقتك لإضافة المزيد.` };
  }
  return { ok: true };
}
