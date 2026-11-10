import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { PAYMENT_STATUS } from "./payment-status";
import { deleteTenant } from "./subscriptions";

const IS_POSTGRES = (process.env.DATABASE_URL ?? "").startsWith("postgres");

// Kept on purpose when a client is deleted: redemption accounting for discount codes and the platform's own audit trail.
const KEPT_TABLES = new Set(["discount_code_usages", "admin_action_logs"]);

/**
 * Why a client may not be deleted for good, or null when it may. Only accounts that never paid can be wiped:
 * once a payment was completed, the billing history has to stay.
 */
export async function clientDeletionBlocker(tenantId: string): Promise<string | null> {
  await ensureSchema();
  const subscription = await prisma.subscription.findUnique({ where: { tenantId }, select: { id: true } });
  if (!subscription) return "العميل غير موجود";
  const [subscriptionPaid, campaignPaid] = await Promise.all([
    prisma.subscriptionPayment.count({ where: { tenantId, status: PAYMENT_STATUS.completed } }),
    prisma.campaignPayment.count({ where: { tenantId, status: PAYMENT_STATUS.completed } }).catch(() => 0)
  ]);
  if (subscriptionPaid + campaignPaid > 0) return "لا يمكن حذف عميل دفع اشتراكًا أو رصيد حملات، حفاظًا على سجل الفوترة. أوقف حسابه بدلًا من حذفه.";
  return null;
}

/** Every table (lazily created ones included) that carries a tenant_id column. */
async function tenantTables(): Promise<string[]> {
  if (IS_POSTGRES) {
    const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      "SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'tenant_id'"
    );
    return rows.map((row) => row.table_name);
  }
  const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>("SELECT name FROM sqlite_master WHERE type = 'table'");
  const result: string[] = [];
  for (const { name } of tables) {
    if (!/^[A-Za-z0-9_]+$/.test(name)) continue;
    const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${name}")`);
    if (columns.some((column) => column.name === "tenant_id")) result.push(name);
  }
  return result;
}

/**
 * Permanently deletes a client and everything of theirs: the modelled data (deleteTenant) and then any other
 * table keyed by tenant_id (projects, units, visits, catalog, loyalty, store links...), each on its own so one
 * odd table cannot leave the rest behind. Never undone.
 */
export async function deleteClientCompletely(tenantId: string): Promise<{ companyName: string; sweptTables: number }> {
  const { companyName } = await deleteTenant(tenantId);
  let sweptTables = 0;
  for (const table of await tenantTables().catch(() => [] as string[])) {
    if (KEPT_TABLES.has(table) || !/^[A-Za-z0-9_]+$/.test(table)) continue;
    try {
      const removed = await prisma.$executeRawUnsafe(`DELETE FROM "${table}" WHERE tenant_id = $1`, tenantId);
      if (Number(removed) > 0) sweptTables += 1;
    } catch (error) {
      console.error("Client deletion sweep failed", { tenantId, table, error });
    }
  }
  return { companyName, sweptTables };
}
