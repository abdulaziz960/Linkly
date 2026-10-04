import type { DiscountCodeRow, PlanRow } from "../types";
import type { Tone } from "../ds/primitives";

export type CodeStatus = "active" | "scheduled" | "expired" | "usage_limit_reached" | "inactive";
export type CodeStatusFilter = "الكل" | "نشط" | "مجدول" | "منتهي" | "معطل";
export type CodeSort = "created" | "usage" | "expiry";

export const STATUS_FILTERS: CodeStatusFilter[] = ["الكل", "نشط", "مجدول", "منتهي", "معطل"];
export const SORT_OPTIONS: Array<{ value: CodeSort; label: string }> = [
  { value: "created", label: "تاريخ الإنشاء" },
  { value: "usage", label: "الاستخدام" },
  { value: "expiry", label: "تاريخ الانتهاء" }
];

export const STATUS_LABEL: Record<CodeStatus, string> = {
  active: "نشط",
  scheduled: "مجدول",
  expired: "منتهي",
  usage_limit_reached: "اكتمل الاستخدام",
  inactive: "معطل"
};

export const STATUS_TONE: Record<CodeStatus, Tone> = {
  active: "success",
  scheduled: "info",
  expired: "neutral",
  usage_limit_reached: "warning",
  inactive: "neutral"
};

export function computeStatus(code: DiscountCodeRow, now: number): CodeStatus {
  if (code.active !== 1) return "inactive";
  if (code.startsAt && new Date(code.startsAt).getTime() > now) return "scheduled";
  if (code.expiresAt && new Date(code.expiresAt).getTime() < now) return "expired";
  if (code.usageLimit !== -1 && code.usedCount >= code.usageLimit) return "usage_limit_reached";
  return "active";
}

function matchesFilter(status: CodeStatus, filter: CodeStatusFilter) {
  if (filter === "الكل") return true;
  if (filter === "نشط") return status === "active";
  if (filter === "مجدول") return status === "scheduled";
  if (filter === "منتهي") return status === "expired" || status === "usage_limit_reached";
  return status === "inactive";
}

export function filterCodes(codes: DiscountCodeRow[], filter: CodeStatusFilter, query: string, now: number) {
  const q = query.trim().toLowerCase();
  return codes.filter((code) => {
    if (q && !code.code.toLowerCase().includes(q) && !code.name.toLowerCase().includes(q)) return false;
    return matchesFilter(computeStatus(code, now), filter);
  });
}

export function sortCodes(codes: DiscountCodeRow[], sort: CodeSort) {
  return [...codes].sort((a, b) => {
    if (sort === "usage") return b.usedCount - a.usedCount;
    if (sort === "expiry") return (a.expiresAt || "9999").localeCompare(b.expiresAt || "9999");
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function codeStats(codes: DiscountCodeRow[], now: number) {
  const statuses = codes.map((code) => computeStatus(code, now));
  return {
    total: codes.length,
    active: statuses.filter((status) => status === "active").length,
    redemptions: codes.reduce((sum, code) => sum + code.usedCount, 0),
    counts: {
      الكل: codes.length,
      نشط: statuses.filter((status) => matchesFilter(status, "نشط")).length,
      مجدول: statuses.filter((status) => matchesFilter(status, "مجدول")).length,
      منتهي: statuses.filter((status) => matchesFilter(status, "منتهي")).length,
      معطل: statuses.filter((status) => matchesFilter(status, "معطل")).length
    } as Record<CodeStatusFilter, number>
  };
}

export function parsePlanIds(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function planNames(applicablePlanIds: string, plans: PlanRow[]) {
  const ids = parsePlanIds(applicablePlanIds);
  if (ids.length === 0) return "كل الباقات";
  return ids.map((id) => plans.find((plan) => plan.id === id)?.name || id).join("، ");
}

// ---- form ----

export type CodeDraft = {
  name: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
  maxDiscountAmount: string;
  minimumAmount: string;
  applyToAllPlans: boolean;
  selectedPlanIds: string[];
  newUsersOnly: boolean;
  firstSubscriptionOnly: boolean;
  usageLimit: string;
  usageLimitPerUser: string;
  startsAt: string;
  expiresAt: string;
};

export const EMPTY_CODE_DRAFT: CodeDraft = {
  name: "",
  code: "",
  discountType: "percentage",
  discountValue: "",
  maxDiscountAmount: "",
  minimumAmount: "",
  applyToAllPlans: true,
  selectedPlanIds: [],
  newUsersOnly: true,
  firstSubscriptionOnly: true,
  usageLimit: "",
  usageLimitPerUser: "1",
  startsAt: "",
  expiresAt: ""
};

export function draftFromCode(code: DiscountCodeRow): CodeDraft {
  const planIds = parsePlanIds(code.applicablePlanIds);
  return {
    name: code.name,
    code: code.code,
    discountType: code.discountType === "fixed" ? "fixed" : "percentage",
    discountValue: String(code.discountValue),
    maxDiscountAmount: code.maxDiscountAmount ? String(code.maxDiscountAmount) : "",
    minimumAmount: code.minimumAmount ? String(code.minimumAmount) : "",
    applyToAllPlans: planIds.length === 0,
    selectedPlanIds: planIds,
    newUsersOnly: code.newUsersOnly === 1,
    firstSubscriptionOnly: code.firstSubscriptionOnly === 1,
    usageLimit: code.usageLimit === -1 ? "" : String(code.usageLimit),
    usageLimitPerUser: String(code.usageLimitPerUser),
    startsAt: code.startsAt ? code.startsAt.slice(0, 10) : "",
    expiresAt: code.expiresAt ? code.expiresAt.slice(0, 10) : ""
  };
}

/** Returns an Arabic error message, or null when the draft can be submitted. */
export function validateCodeDraft(draft: CodeDraft): string | null {
  if (!draft.name.trim()) return "اسم الكود مطلوب.";
  if (!draft.code.trim()) return "كود الخصم مطلوب.";
  const value = Number(draft.discountValue);
  if (!Number.isFinite(value) || value <= 0) return "قيمة الخصم يجب أن تكون أكبر من صفر.";
  if (draft.discountType === "percentage" && value > 100) return "نسبة الخصم لا يمكن أن تتجاوز 100٪.";
  if (draft.usageLimit !== "" && (!Number.isInteger(Number(draft.usageLimit)) || Number(draft.usageLimit) < 0)) return "الحد الأقصى للاستخدام يجب أن يكون رقمًا صحيحًا لا يقل عن صفر.";
  const perUser = Number(draft.usageLimitPerUser || 1);
  if (!Number.isInteger(perUser) || perUser < 1) return "حد الاستخدام لكل عميل يجب أن يكون 1 على الأقل.";
  if (!draft.applyToAllPlans && draft.selectedPlanIds.length === 0) return "اختر باقة واحدة على الأقل، أو فعّل «ينطبق على كل الباقات».";
  if (draft.startsAt && draft.expiresAt && draft.startsAt > draft.expiresAt) return "تاريخ البداية يجب أن يسبق تاريخ الانتهاء.";
  return null;
}

export function codePayload(draft: CodeDraft) {
  return {
    name: draft.name,
    code: draft.code,
    discountType: draft.discountType,
    discountValue: Number(draft.discountValue || 0),
    maxDiscountAmount: Number(draft.maxDiscountAmount || 0),
    minimumAmount: Number(draft.minimumAmount || 0),
    applicablePlanIds: draft.applyToAllPlans ? [] : draft.selectedPlanIds,
    newUsersOnly: draft.newUsersOnly,
    firstSubscriptionOnly: draft.firstSubscriptionOnly,
    usageLimit: draft.usageLimit === "" ? -1 : Number(draft.usageLimit),
    usageLimitPerUser: Number(draft.usageLimitPerUser || 1),
    startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : "",
    expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : ""
  };
}

export function discountLabel(code: Pick<DiscountCodeRow, "discountType" | "discountValue" | "maxDiscountAmount">, format: (n: number) => string) {
  if (code.discountType === "percentage") {
    return { main: `${format(code.discountValue)}٪`, note: code.maxDiscountAmount ? `بحد أقصى ${format(code.maxDiscountAmount)} ر.س` : "" };
  }
  return { main: `${format(code.discountValue)} ر.س`, note: "مبلغ ثابت" };
}
