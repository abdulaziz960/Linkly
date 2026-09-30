import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { PAYMENT_STATUS } from "./payment-status";

function nowTimestamp() {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
    numberingSystem: "latn",
    calendar: "gregory"
  }).format(new Date());
}

export function normalizePromoCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export async function hasEverHadSuccessfulPaidSubscription(tenantId: string) {
  await ensureSchema();
  const count = await prisma.subscriptionPayment.count({
    where: { tenantId, status: PAYMENT_STATUS.completed }
  });
  return count > 0;
}

export type PromoCodeErrorCode =
  | "INVALID_CODE"
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "USAGE_LIMIT"
  | "ALREADY_USED"
  | "EXISTING_CUSTOMER"
  | "WRONG_PLAN"
  | "BELOW_MINIMUM";

const errorMessages: Record<PromoCodeErrorCode, { ar: string; en: string }> = {
  INVALID_CODE: { ar: "هذا الكود غير صالح.", en: "This promo code is invalid." },
  INACTIVE: { ar: "هذا الكود غير مفعل حاليا.", en: "This promo code is inactive." },
  NOT_STARTED: { ar: "هذا الكود غير مفعل بعد.", en: "This promo code is not active yet." },
  EXPIRED: { ar: "انتهت صلاحية هذا الكود.", en: "This promo code has expired." },
  USAGE_LIMIT: { ar: "وصل هذا الكود الى الحد الاقصى للاستخدام.", en: "This promo code has reached its usage limit." },
  ALREADY_USED: { ar: "تم استخدام هذا الكود مسبقا.", en: "This promo code has already been used." },
  EXISTING_CUSTOMER: { ar: "هذا الكود متاح للعملاء الجدد فقط.", en: "This promo code is available for new customers only." },
  WRONG_PLAN: { ar: "هذا الكود غير متاح للباقة المختارة.", en: "This promo code is not available for the selected plan." },
  BELOW_MINIMUM: { ar: "قيمة الاشتراك اقل من الحد الادنى المطلوب لهذا الكود.", en: "The subscription amount is below this codes minimum." }
};

export function promoCodeErrorMessage(code: PromoCodeErrorCode, lang: "ar" | "en" = "ar") {
  return errorMessages[code][lang];
}

type ValidateInput = {
  code: string;
  tenantId: string;
  planId: string;
  planName: string;
  amountSar: number;
};

type ValidateResult =
  | { ok: true; discountCode: NonNullable<Awaited<ReturnType<typeof findActiveDiscountCode>>>; discountAmount: number; finalAmount: number }
  | { ok: false; errorCode: PromoCodeErrorCode };

async function findActiveDiscountCode(normalizedCode: string) {
  await ensureSchema();
  return prisma.discountCode.findUnique({ where: { code: normalizedCode } });
}

export function computeDiscountAmount(discountCode: { discountType: string; discountValue: number; maxDiscountAmount: number }, amountSar: number) {
  const raw = discountCode.discountType === "percentage"
    ? (amountSar * discountCode.discountValue) / 100
    : discountCode.discountValue;
  const capped = discountCode.maxDiscountAmount > 0 ? Math.min(raw, discountCode.maxDiscountAmount) : raw;
  return Math.max(0, Math.min(capped, amountSar));
}

export async function validatePromoCode({ code, tenantId, planId, planName, amountSar }: ValidateInput): Promise<ValidateResult> {
  void planName;
  const normalized = normalizePromoCode(code);
  if (!normalized) return { ok: false, errorCode: "INVALID_CODE" };

  const discountCode = await findActiveDiscountCode(normalized);
  if (!discountCode) return { ok: false, errorCode: "INVALID_CODE" };
  if (discountCode.active !== 1) return { ok: false, errorCode: "INACTIVE" };

  const now = new Date();
  if (discountCode.startsAt && new Date(discountCode.startsAt) > now) return { ok: false, errorCode: "NOT_STARTED" };
  if (discountCode.expiresAt && new Date(discountCode.expiresAt) < now) return { ok: false, errorCode: "EXPIRED" };

  if (discountCode.usageLimit !== -1 && discountCode.usedCount >= discountCode.usageLimit) {
    return { ok: false, errorCode: "USAGE_LIMIT" };
  }

  const applicablePlanIds = parseApplicablePlanIds(discountCode.applicablePlanIds);
  if (applicablePlanIds.length > 0 && !applicablePlanIds.includes(planId)) {
    return { ok: false, errorCode: "WRONG_PLAN" };
  }

  if (discountCode.newUsersOnly === 1 || discountCode.firstSubscriptionOnly === 1) {
    const everPaid = await hasEverHadSuccessfulPaidSubscription(tenantId);
    if (everPaid) return { ok: false, errorCode: "EXISTING_CUSTOMER" };
  }

  const perUserUsageCount = await prisma.discountCodeUsage.count({
    where: { discountCodeId: discountCode.id, tenantId, paymentStatus: { in: ["pending", "completed"] } }
  });
  if (perUserUsageCount >= discountCode.usageLimitPerUser) return { ok: false, errorCode: "ALREADY_USED" };

  if (discountCode.minimumAmount > 0 && amountSar < discountCode.minimumAmount) {
    return { ok: false, errorCode: "BELOW_MINIMUM" };
  }

  const discountAmount = computeDiscountAmount(discountCode, amountSar);
  return { ok: true, discountCode, discountAmount, finalAmount: amountSar - discountAmount };
}

function parseApplicablePlanIds(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

type ReserveInput = ValidateInput & {
  paymentId: string;
  userId: string;
  userName: string;
  email: string;
};

type ReserveResult =
  | { ok: true; discountAmount: number; finalAmount: number }
  | { ok: false; errorCode: PromoCodeErrorCode };

export async function reservePromoCodeUsage(tx: Prisma.TransactionClient, input: ReserveInput): Promise<ReserveResult> {
  const validation = await validatePromoCode(input);
  if (!validation.ok) return validation;
  const { discountCode, discountAmount, finalAmount } = validation;

  const claimed = await tx.discountCode.updateMany({
    where: {
      id: discountCode.id,
      OR: [{ usageLimit: -1 }, { usedCount: { lt: discountCode.usageLimit } }]
    },
    data: { usedCount: { increment: 1 }, updatedAt: nowTimestamp() }
  });
  if (claimed.count !== 1) return { ok: false, errorCode: "USAGE_LIMIT" };

  await tx.discountCodeUsage.create({
    data: {
      id: `promo-use-${randomUUID()}`,
      discountCodeId: discountCode.id,
      tenantId: input.tenantId,
      userId: input.userId,
      userName: input.userName,
      email: input.email,
      planId: input.planId,
      planName: input.planName,
      paymentId: input.paymentId,
      originalAmount: input.amountSar,
      discountAmount,
      finalAmount,
      paymentStatus: "pending",
      createdAt: nowTimestamp()
    }
  });

  return { ok: true, discountAmount, finalAmount };
}

export async function confirmPromoCodeUsage(tx: Prisma.TransactionClient, paymentId: string, subscriptionId: string) {
  await tx.discountCodeUsage.updateMany({
    where: { paymentId, paymentStatus: "pending" },
    data: { paymentStatus: "completed", subscriptionId, usedAt: nowTimestamp() }
  });
}

export async function releasePromoCodeUsage(paymentId: string, status: "failed" | "expired") {
  await ensureSchema();
  const usage = await prisma.discountCodeUsage.findFirst({ where: { paymentId, paymentStatus: "pending" } });
  if (!usage) return;
  await prisma.$transaction([
    prisma.discountCode.updateMany({
      where: { id: usage.discountCodeId, usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 }, updatedAt: nowTimestamp() }
    }),
    prisma.discountCodeUsage.update({ where: { id: usage.id }, data: { paymentStatus: status } })
  ]);
}

export async function getDiscountCodes() {
  await ensureSchema();
  return prisma.discountCode.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getDiscountCodeById(id: string) {
  await ensureSchema();
  return prisma.discountCode.findUnique({ where: { id } });
}

type CreateDiscountCodeInput = {
  name: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  maxDiscountAmount?: number;
  minimumAmount?: number;
  applicablePlanIds?: string[];
  newUsersOnly?: boolean;
  firstSubscriptionOnly?: boolean;
  usageLimit?: number;
  usageLimitPerUser?: number;
  startsAt?: string;
  expiresAt?: string;
  createdBy?: string;
};

function validateDiscountCodeInput(input: Partial<CreateDiscountCodeInput>) {
  if (input.name !== undefined && !input.name.trim()) throw new Error("اسم الكود مطلوب");
  if (input.code !== undefined && !normalizePromoCode(input.code)) throw new Error("كود الخصم مطلوب");
  if (input.discountType !== undefined && input.discountType !== "percentage" && input.discountType !== "fixed") {
    throw new Error("نوع الخصم غير صحيح");
  }
  if (input.discountValue !== undefined && (!Number.isFinite(input.discountValue) || input.discountValue <= 0)) {
    throw new Error("قيمة الخصم غير صحيحة");
  }
  if (input.discountType === "percentage" && input.discountValue !== undefined && input.discountValue > 100) {
    throw new Error("نسبة الخصم لا يمكن ان تتجاوز 100%");
  }
  if (input.usageLimit !== undefined && input.usageLimit !== -1 && input.usageLimit < 0) {
    throw new Error("الحد الاقصى للاستخدام غير صحيح");
  }
  if (input.usageLimitPerUser !== undefined && input.usageLimitPerUser < 1) {
    throw new Error("الحد الاقصى للاستخدام لكل عميل غير صحيح");
  }
}

export async function createDiscountCode(input: CreateDiscountCodeInput) {
  await ensureSchema();
  validateDiscountCodeInput(input);
  const code = normalizePromoCode(input.code);
  const existing = await prisma.discountCode.findUnique({ where: { code } });
  if (existing) throw new Error("يوجد كود خصم بهذا الاسم بالفعل");

  const now = nowTimestamp();
  const newUsersOnly = Boolean(input.newUsersOnly);
  return prisma.discountCode.create({
    data: {
      id: `promo-${randomUUID()}`,
      name: input.name.trim(),
      code,
      discountType: input.discountType,
      discountValue: input.discountValue,
      maxDiscountAmount: input.maxDiscountAmount ?? 0,
      minimumAmount: input.minimumAmount ?? 0,
      applicablePlanIds: JSON.stringify(input.applicablePlanIds ?? []),
      newUsersOnly: newUsersOnly ? 1 : 0,
      firstSubscriptionOnly: input.firstSubscriptionOnly !== undefined ? (input.firstSubscriptionOnly ? 1 : 0) : (newUsersOnly ? 1 : 0),
      usageLimit: input.usageLimit ?? -1,
      usageLimitPerUser: input.usageLimitPerUser ?? 1,
      startsAt: input.startsAt || "",
      expiresAt: input.expiresAt || "",
      active: 1,
      createdBy: input.createdBy || "",
      createdAt: now,
      updatedAt: now
    }
  });
}

type UpdateDiscountCodeInput = Partial<Omit<CreateDiscountCodeInput, "code">> & { active?: boolean };

export async function updateDiscountCode(id: string, input: UpdateDiscountCodeInput) {
  await ensureSchema();
  const existing = await prisma.discountCode.findUnique({ where: { id } });
  if (!existing) throw new Error("كود الخصم غير موجود");
  validateDiscountCodeInput(input);

  return prisma.discountCode.update({
    where: { id },
    data: {
      name: input.name !== undefined ? input.name.trim() : existing.name,
      discountType: input.discountType ?? existing.discountType,
      discountValue: input.discountValue ?? existing.discountValue,
      maxDiscountAmount: input.maxDiscountAmount ?? existing.maxDiscountAmount,
      minimumAmount: input.minimumAmount ?? existing.minimumAmount,
      applicablePlanIds: input.applicablePlanIds !== undefined ? JSON.stringify(input.applicablePlanIds) : existing.applicablePlanIds,
      newUsersOnly: input.newUsersOnly !== undefined ? (input.newUsersOnly ? 1 : 0) : existing.newUsersOnly,
      firstSubscriptionOnly: input.firstSubscriptionOnly !== undefined ? (input.firstSubscriptionOnly ? 1 : 0) : existing.firstSubscriptionOnly,
      usageLimit: input.usageLimit ?? existing.usageLimit,
      usageLimitPerUser: input.usageLimitPerUser ?? existing.usageLimitPerUser,
      startsAt: input.startsAt !== undefined ? input.startsAt : existing.startsAt,
      expiresAt: input.expiresAt !== undefined ? input.expiresAt : existing.expiresAt,
      active: input.active !== undefined ? (input.active ? 1 : 0) : existing.active,
      updatedAt: nowTimestamp()
    }
  });
}

export async function getDiscountCodeUsageStats(discountCodeId: string) {
  await ensureSchema();
  const usages = await prisma.discountCodeUsage.findMany({
    where: { discountCodeId, paymentStatus: "completed" },
    orderBy: { usedAt: "desc" }
  });
  const totalUses = usages.length;
  const totalDiscountGiven = usages.reduce((sum, usage) => sum + usage.discountAmount, 0);
  const revenueGenerated = usages.reduce((sum, usage) => sum + usage.finalAmount, 0);
  return { totalUses, totalDiscountGiven, revenueGenerated, usages };
}

export function computeDiscountCodeStatus(discountCode: { active: number; startsAt: string; expiresAt: string; usageLimit: number; usedCount: number }) {
  if (discountCode.active !== 1) return "inactive";
  const now = new Date();
  if (discountCode.startsAt && new Date(discountCode.startsAt) > now) return "scheduled";
  if (discountCode.expiresAt && new Date(discountCode.expiresAt) < now) return "expired";
  if (discountCode.usageLimit !== -1 && discountCode.usedCount >= discountCode.usageLimit) return "usage_limit_reached";
  return "active";
}
