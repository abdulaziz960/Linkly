import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";

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

  const existing = await prisma.plan.findUnique({ where: { name } });
  if (existing) throw new Error("يوجد باقة بنفس الاسم بالفعل");

  const maxSortOrder = await prisma.plan.aggregate({ _max: { sortOrder: true } });
  const now = nowTimestamp();

  return prisma.plan.create({
    data: {
      id: `plan-${randomUUID()}`,
      name,
      monthlyPrice: Math.round(input.monthlyPrice),
      employeeLimit: Math.round(input.employeeLimit),
      aiDailyLimit: Math.round(aiDailyLimit),
      aiMonthlyLimit: Math.round(aiMonthlyLimit),
      sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
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

  return prisma.plan.update({
    where: { id },
    data: {
      monthlyPrice: input.monthlyPrice !== undefined ? Math.round(input.monthlyPrice) : existing.monthlyPrice,
      employeeLimit: input.employeeLimit !== undefined ? Math.round(input.employeeLimit) : existing.employeeLimit,
      aiDailyLimit: input.aiDailyLimit !== undefined ? Math.round(input.aiDailyLimit) : existing.aiDailyLimit,
      aiMonthlyLimit: input.aiMonthlyLimit !== undefined ? Math.round(input.aiMonthlyLimit) : existing.aiMonthlyLimit,
      active: input.active !== undefined ? (input.active ? 1 : 0) : existing.active,
      updatedAt: nowTimestamp()
    }
  });
}
