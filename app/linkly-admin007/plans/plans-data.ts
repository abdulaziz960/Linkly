import type { PlanRow } from "../types";
import { parseAllowedChannels, type AllowedChannels } from "../../../lib/channel-catalog";
import { UNLIMITED_MESSAGE_QUOTA } from "../../../lib/message-quota";

/** Form state (everything is a string while typing). */
export type PlanDraft = {
  name: string;
  monthlyPrice: string;
  employeeLimit: string;
  aiDailyLimit: string;
  aiMonthlyLimit: string;
  messageQuota: string;
  messageUnlimited: boolean;
  channels: AllowedChannels;
  active: boolean;
};

export const EMPTY_PLAN_DRAFT: PlanDraft = {
  name: "",
  monthlyPrice: "0",
  employeeLimit: "1",
  aiDailyLimit: "0",
  aiMonthlyLimit: "0",
  messageQuota: "0",
  messageUnlimited: false,
  channels: "*",
  active: true
};

export function draftFromPlan(plan: PlanRow): PlanDraft {
  const unlimited = plan.messageQuota === UNLIMITED_MESSAGE_QUOTA;
  return {
    name: plan.name,
    monthlyPrice: String(plan.monthlyPrice),
    employeeLimit: String(plan.employeeLimit),
    aiDailyLimit: String(plan.aiDailyLimit),
    aiMonthlyLimit: String(plan.aiMonthlyLimit),
    messageQuota: unlimited ? "0" : String(plan.messageQuota),
    messageUnlimited: unlimited,
    channels: parseAllowedChannels(plan.allowedChannels || "*"),
    active: plan.active === 1
  };
}

const isNonNegative = (value: number) => Number.isFinite(value) && value >= 0;

/** Returns an Arabic error message, or null when the draft can be submitted. */
export function validatePlanDraft(draft: PlanDraft, mode: "create" | "edit"): string | null {
  if (mode === "create" && !draft.name.trim()) return "اسم الباقة مطلوب.";
  if (!isNonNegative(Number(draft.monthlyPrice))) return "السعر الشهري يجب أن يكون رقمًا لا يقل عن صفر.";
  const employeeLimit = Number(draft.employeeLimit);
  if (!Number.isFinite(employeeLimit) || employeeLimit < 1) return "حد المستخدمين يجب أن يكون 1 على الأقل.";
  if (!isNonNegative(Number(draft.aiDailyLimit)) || !isNonNegative(Number(draft.aiMonthlyLimit))) return "حدود الذكاء الاصطناعي يجب ألا تقل عن صفر.";
  if (!draft.messageUnlimited && !isNonNegative(Number(draft.messageQuota))) return "حصة الرسائل التسويقية يجب ألا تقل عن صفر.";
  if (Array.isArray(draft.channels) && draft.channels.length === 0) return "اختر قناة واحدة على الأقل، أو فعّل «كل القنوات».";
  return null;
}

export function planPayload(draft: PlanDraft, mode: "create" | "edit") {
  const base = {
    monthlyPrice: Number(draft.monthlyPrice),
    employeeLimit: Number(draft.employeeLimit),
    aiDailyLimit: Number(draft.aiDailyLimit),
    aiMonthlyLimit: Number(draft.aiMonthlyLimit),
    allowedChannels: draft.channels,
    messageQuota: draft.messageUnlimited ? UNLIMITED_MESSAGE_QUOTA : Number(draft.messageQuota)
  };
  return mode === "create" ? { name: draft.name.trim(), ...base } : { ...base, active: draft.active };
}

export function planStats(plans: PlanRow[], subscriberCounts: Record<string, number>) {
  const active = plans.filter((plan) => plan.active === 1).length;
  return {
    total: plans.length,
    active,
    disabled: plans.length - active,
    subscribers: plans.reduce((sum, plan) => sum + (subscriberCounts[plan.name] || 0), 0),
    averagePrice: plans.length ? Math.round(plans.reduce((sum, plan) => sum + plan.monthlyPrice, 0) / plans.length) : 0
  };
}
