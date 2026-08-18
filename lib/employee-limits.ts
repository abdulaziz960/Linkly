import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { planEmployeeLimits } from "./subscriptions";

export const employeeLimitReachedMessage =
  "نعتذر ، ولكنك وصلت الى الحد الاقصى من اضافة الموظفين في باقتك المختارة يمكنك ترقية الباقة او التواصل معنا";

const defaultEmployeeLimit = planEmployeeLimits["باقة النمو"];

export async function getEmployeeLimitForTenant(tenantId?: string) {
  await ensureSchema().catch(() => {});
  const subscription = tenantId
    ? await prisma.subscription.findUnique({ where: { tenantId } }).catch(() => null)
    : null;

  return subscription?.employeeLimit ?? defaultEmployeeLimit;
}
