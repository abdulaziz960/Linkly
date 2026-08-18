import { prisma } from "./prisma";
import { ensureSchema } from "./database";

function nowTimestamp() {
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh"
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
};

export async function createPlan(input: CreatePlanInput) {
  await ensureSchema();
  const name = input.name.trim();
  if (!name) throw new Error("اسم الباقة مطلوب");
  if (!Number.isFinite(input.monthlyPrice) || input.monthlyPrice < 0) throw new Error("السعر الشهري غير صحيح");
  if (!Number.isFinite(input.employeeLimit) || input.employeeLimit < 1) throw new Error("حد المستخدمين غير صحيح");

  const existing = await prisma.plan.findUnique({ where: { name } });
  if (existing) throw new Error("يوجد باقة بنفس الاسم بالفعل");

  const maxSortOrder = await prisma.plan.aggregate({ _max: { sortOrder: true } });
  const now = nowTimestamp();

  return prisma.plan.create({
    data: {
      id: `plan-${Date.now()}`,
      name,
      monthlyPrice: Math.round(input.monthlyPrice),
      employeeLimit: Math.round(input.employeeLimit),
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

  return prisma.plan.update({
    where: { id },
    data: {
      monthlyPrice: input.monthlyPrice !== undefined ? Math.round(input.monthlyPrice) : existing.monthlyPrice,
      employeeLimit: input.employeeLimit !== undefined ? Math.round(input.employeeLimit) : existing.employeeLimit,
      active: input.active !== undefined ? (input.active ? 1 : 0) : existing.active,
      updatedAt: nowTimestamp()
    }
  });
}
