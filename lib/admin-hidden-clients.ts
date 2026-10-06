import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { getSubscriptions } from "./subscriptions";

/**
 * Clients the platform team has hidden from the admin panel's lists, counts and
 * notifications (test and demo workspaces). Nothing is deleted or suspended by
 * this - the workspace keeps working and its renewals, billing and trial
 * expiry still run; only the admin views stop showing it. If the table cannot
 * be read nothing is hidden, so a failure can never make a real client vanish.
 */
export async function getHiddenTenantIds(): Promise<Set<string>> {
  try {
    await ensureSchema();
    const rows = await prisma.adminHiddenClient.findMany({ select: { tenantId: true } });
    return new Set(rows.map((row) => row.tenantId));
  } catch (error) {
    console.error("[admin-hidden-clients] could not read hidden clients, showing everything", error);
    return new Set();
  }
}

export async function setClientsHidden(tenantIds: string[], hidden: boolean, updatedBy: string) {
  await ensureSchema();
  const ids = Array.from(new Set(tenantIds.filter((id) => typeof id === "string" && id)));
  if (!ids.length) return 0;
  if (hidden) {
    const now = new Date().toISOString();
    for (const tenantId of ids) {
      await prisma.adminHiddenClient.upsert({
        where: { tenantId },
        create: { tenantId, hiddenAt: now, hiddenBy: updatedBy },
        update: { hiddenAt: now, hiddenBy: updatedBy }
      });
    }
  } else {
    await prisma.adminHiddenClient.deleteMany({ where: { tenantId: { in: ids } } });
  }
  return ids.length;
}

/** Every subscription except the hidden ones - for the admin panel's lists, totals and notifications. */
export async function getVisibleSubscriptions() {
  const [subscriptions, hidden] = await Promise.all([getSubscriptions(), getHiddenTenantIds()]);
  return subscriptions.filter((subscription) => !hidden.has(subscription.tenantId));
}
