import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { fetchZidProducts } from "./zid";
import { importFeedRecords } from "./product-feed";
import { listConnectedTenants } from "./store-connections";

/**
 * Pulls the connected Zid store's products into the workspace catalog through the Merchant API (needs the
 * app's "Products: read" scope). Products are stored as source "api" with an external id "zid-<id>", so they
 * never collide with a feed URL or the public API, and only ids with that prefix are hidden when a product
 * disappears from the store (and only after a read that returned at least one product).
 */

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= prisma
    .$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS store_product_sync (
      tenant_id TEXT NOT NULL,
      store TEXT NOT NULL,
      last_at TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (tenant_id, store)
    )`)
    .then(() => undefined)
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}

export type ProductSyncStatus = { lastAt: string; status: string; message: string };

export async function getZidProductSyncStatus(tenantId: string): Promise<ProductSyncStatus> {
  await ensureTable();
  const rows = await prisma.$queryRaw<Array<{ last_at: string; status: string; message: string }>>`SELECT last_at, status, message FROM store_product_sync WHERE tenant_id = ${tenantId} AND store = 'zid'`;
  const row = rows[0];
  return { lastAt: row?.last_at ?? "", status: row?.status ?? "", message: row?.message ?? "" };
}

async function saveStatus(tenantId: string, status: string, message: string) {
  await ensureTable();
  const now = new Date().toISOString();
  const existing = await prisma.$queryRaw<Array<{ tenant_id: string }>>`SELECT tenant_id FROM store_product_sync WHERE tenant_id = ${tenantId} AND store = 'zid'`;
  if (existing.length) {
    await prisma.$executeRaw`UPDATE store_product_sync SET last_at = ${now}, status = ${status}, message = ${message} WHERE tenant_id = ${tenantId} AND store = 'zid'`;
  } else {
    await prisma.$executeRaw`INSERT INTO store_product_sync (tenant_id, store, last_at, status, message) VALUES (${tenantId}, 'zid', ${now}, ${status}, ${message})`;
  }
}

export type ZidProductSyncResult = { ok: boolean; created: number; updated: number; skipped: number; deactivated: number; message: string };

export async function syncZidProducts(tenantId: string): Promise<ZidProductSyncResult> {
  await ensureSchema();
  const fetched = await fetchZidProducts(tenantId);
  if (!fetched.ok) {
    await saveStatus(tenantId, "error", fetched.message);
    return { ok: false, created: 0, updated: 0, skipped: 0, deactivated: 0, message: fetched.message };
  }
  const imported = await importFeedRecords(tenantId, fetched.records, "api");

  let deactivated = 0;
  if (imported.seen.size > 0) {
    const stale = await prisma.product.updateMany({
      where: { tenantId, source: "api", active: 1, externalId: { startsWith: "zid-", notIn: [...imported.seen] } },
      data: { active: 0, updatedAt: new Date().toISOString() }
    });
    deactivated = stale.count;
  }

  const message = `تمت المزامنة: ${imported.created} جديد، ${imported.updated} محدّث، ${imported.skipped} متجاهل، ${deactivated} مخفي${imported.blockedByPlan ? `، ${imported.blockedByPlan} فوق حد الباقة` : ""}`;
  await saveStatus(tenantId, "ok", message);
  return { ok: true, created: imported.created, updated: imported.updated, skipped: imported.skipped, deactivated, message };
}

/** Cron: re-syncs connected Zid stores whose last sync is older than the interval, a small batch per tick. */
export async function syncDueZidProducts(intervalHours = 6, batch = 5): Promise<{ synced: number; failed: number }> {
  const tenants = await listConnectedTenants("zid");
  const cutoff = Date.now() - intervalHours * 3600_000;
  let synced = 0;
  let failed = 0;
  for (const tenantId of tenants) {
    if (synced + failed >= batch) break;
    const last = await getZidProductSyncStatus(tenantId);
    // Only stores that were synced once (by the owner pressing the button or on connect) keep syncing.
    if (!last.lastAt || Date.parse(last.lastAt) > cutoff) continue;
    const result = await syncZidProducts(tenantId).catch(() => null);
    if (result?.ok) synced += 1;
    else failed += 1;
  }
  return { synced, failed };
}
