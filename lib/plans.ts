import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema, isPostgresDatabase, insertPlanRowSelfHealing } from "./database";
import { serializeAllowedChannels, type AllowedChannels } from "./channel-catalog";
import { UNLIMITED_MESSAGE_QUOTA } from "./message-quota";

function isValidMessageQuota(value: number) {
  return Number.isFinite(value) && (value === UNLIMITED_MESSAGE_QUOTA || value >= 0);
}

function nowTimestamp() {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
    numberingSystem: "latn",
    calendar: "gregory"
  }).format(new Date());
}

export async function getPlans() {
  await ensureSchema();
  return prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function getActivePlans() {
  await ensureSchema();
  return prisma.plan.findMany({ where: { active: 1 }, orderBy: { sortOrder: "asc" } });
}

type CreatePlanInput = {
  name: string;
  monthlyPrice: number;
  employeeLimit: number;
  aiDailyLimit?: number;
  aiMonthlyLimit?: number;
  allowedChannels?: AllowedChannels;
  messageQuota?: number;
};

export async function createPlan(input: CreatePlanInput) {
  await ensureSchema();
  const name = input.name.trim();
  if (!name) throw new Error("اسم الباقة مطلوب");
  if (!Number.isFinite(input.monthlyPrice) || input.monthlyPrice < 0) throw new Error("السعر الشهري غير صحيح");
  if (!Number.isFinite(input.employeeLimit) || input.employeeLimit < 1) throw new Error("حد المستخدمين غير صحيح");
  const aiDailyLimit = input.aiDailyLimit ?? 0;
  const aiMonthlyLimit = input.aiMonthlyLimit ?? 0;
  if (!Number.isFinite(aiDailyLimit) || aiDailyLimit < 0) throw new Error("الحد اليومي للذكاء الاصطناعي غير صحيح");
  if (!Number.isFinite(aiMonthlyLimit) || aiMonthlyLimit < 0) throw new Error("الحد الشهري للذكاء الاصطناعي غير صحيح");
  const messageQuota = input.messageQuota ?? 0;
  if (!isValidMessageQuota(messageQuota)) throw new Error("حصة الرسائل التسويقية غير صحيحة");

  const existing = await prisma.plan.findUnique({ where: { name } });
  if (existing) throw new Error("يوجد باقة بنفس الاسم بالفعل");

  const maxSortOrder = await prisma.plan.aggregate({ _max: { sortOrder: true } });
  const now = nowTimestamp();
  const id = `plan-${randomUUID()}`;
  const sortOrder = (maxSortOrder._max.sortOrder ?? 0) + 1;
  const roundedPrice = Math.round(input.monthlyPrice);
  const roundedEmployeeLimit = Math.round(input.employeeLimit);
  const roundedAiDailyLimit = Math.round(aiDailyLimit);
  const roundedAiMonthlyLimit = Math.round(aiMonthlyLimit);
  const roundedMessageQuota = Math.round(messageQuota);
  const allowedChannels = serializeAllowedChannels(input.allowedChannels ?? "*");

  if (isPostgresDatabase) {
    // Production's live `plans` table carries legacy columns (monthly_amount,
    // and others) outside our Prisma schema entirely - prisma.plan.create()
    // below can't set columns it doesn't know exist, so this introspects the
    // real table and fills in anything it's missing (see
    // insertPlanRowSelfHealing in lib/database.ts for why).
    await insertPlanRowSelfHealing({
      id, name,
      monthly_price: roundedPrice,
      monthly_amount: roundedPrice,
      employee_limit: roundedEmployeeLimit,
      sort_order: sortOrder,
      active: 1,
      ai_daily_limit: roundedAiDailyLimit,
      ai_monthly_limit: roundedAiMonthlyLimit,
      allowed_channels: allowedChannels,
      message_quota: roundedMessageQuota,
      created_at: now,
      updated_at: now
    });
    const created = await prisma.plan.findUnique({ where: { id } });
    if (!created) throw new Error("تعذر إنشاء الباقة");
    return created;
  }

  return prisma.plan.create({
    data: {
      id,
      name,
      monthlyPrice: roundedPrice,
      employeeLimit: roundedEmployeeLimit,
      aiDailyLimit: roundedAiDailyLimit,
      aiMonthlyLimit: roundedAiMonthlyLimit,
      allowedChannels,
      messageQuota: roundedMessageQuota,
      sortOrder,
      active: 1,
      createdAt: now,
      updatedAt: now
    }
  });
}

type UpdatePlanInput = {
  monthlyPrice?: number;
  employeeLimit?: number;
  active?: boolean;
  aiDailyLimit?: number;
  aiMonthlyLimit?: number;
  allowedChannels?: AllowedChannels;
  messageQuota?: number;
};

export async function updatePlan(id: string, input: UpdatePlanInput) {
  await ensureSchema();
  const existing = await prisma.plan.findUnique({ where: { id } });
  if (!existing) throw new Error("الباقة غير موجودة");

  if (input.monthlyPrice !== undefined && (!Number.isFinite(input.monthlyPrice) || input.monthlyPrice < 0)) {
    throw new Error("السعر الشهري غير صحيح");
  }
  if (input.employeeLimit !== undefined && (!Number.isFinite(input.employeeLimit) || input.employeeLimit < 1)) {
    throw new Error("حد المستخدمين غير صحيح");
  }
  if (input.aiDailyLimit !== undefined && (!Number.isFinite(input.aiDailyLimit) || input.aiDailyLimit < 0)) {
    throw new Error("الحد اليومي للذكاء الاصطناعي غير صحيح");
  }
  if (input.aiMonthlyLimit !== undefined && (!Number.isFinite(input.aiMonthlyLimit) || input.aiMonthlyLimit < 0)) {
    throw new Error("الحد الشهري للذكاء الاصطناعي غير صحيح");
  }
  if (input.messageQuota !== undefined && !isValidMessageQuota(input.messageQuota)) {
    throw new Error("حصة الرسائل التسويقية غير صحيحة");
  }

  return prisma.plan.update({
    where: { id },
    data: {
      monthlyPrice: input.monthlyPrice !== undefined ? Math.round(input.monthlyPrice) : existing.monthlyPrice,
      employeeLimit: input.employeeLimit !== undefined ? Math.round(input.employeeLimit) : existing.employeeLimit,
      aiDailyLimit: input.aiDailyLimit !== undefined ? Math.round(input.aiDailyLimit) : existing.aiDailyLimit,
      aiMonthlyLimit: input.aiMonthlyLimit !== undefined ? Math.round(input.aiMonthlyLimit) : existing.aiMonthlyLimit,
      allowedChannels: input.allowedChannels !== undefined ? serializeAllowedChannels(input.allowedChannels) : existing.allowedChannels,
      messageQuota: input.messageQuota !== undefined ? Math.round(input.messageQuota) : existing.messageQuota,
      active: input.active !== undefined ? (input.active ? 1 : 0) : existing.active,
      updatedAt: nowTimestamp()
    }
  });
}
