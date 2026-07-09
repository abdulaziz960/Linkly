import { prisma } from "./prisma";

export const employeeLimitReachedMessage =
  "نعتذر ، ولكنك وصلت الى الحد الاقصى من اضافة الموظفين في باقتك المختارة يمكنك ترقية الباقة او التواصل معنا";

const planEmployeeLimits: Record<string, number> = {
  "باقة البداية": 1,
  "باقة النمو": 3,
  "باقة الأعمال": 10
};

const defaultEmployeeLimit = planEmployeeLimits["باقة النمو"];

function getPlanEmployeeLimit(plan?: string) {
  return plan ? planEmployeeLimits[plan] ?? defaultEmployeeLimit : defaultEmployeeLimit;
}

export async function getEmployeeLimitForTenant(tenantId?: string) {
  const directClient = tenantId
    ? await prisma.providerClient.findUnique({ where: { id: tenantId } }).catch(() => null)
    : null;

  return getPlanEmployeeLimit(directClient?.plan);
}
