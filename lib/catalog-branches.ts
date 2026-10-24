// Branches with their own stock. A product's stock at a branch is its row in catalog_branch_stock (no row, or -1 = not
// tracked there). The customer picks a branch at checkout; the order is taken from that branch's stock and remembers it.

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { ensureCatalogSchema } from "./catalog-schema";
import { ensureBranchesSchema } from "./branches-schema";
import { isBranchOpen } from "./branch-hours";

export type Branch = { id: string; name: string; nameEn: string; address: string; mapUrl: string; active: boolean; workingHours: string; latitude: number; longitude: number };

// The branch stays chosen while the customer browses and checks out; a new order asks again.
const CHOICE_MINUTES = 12 * 60;
const MAX_BRANCHES = 50;

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= Promise.all([ensureCatalogSchema(), ensureBranchesSchema()]).then(() => undefined).catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

// The branches themselves are the ones on the Branches page (the `branches` table, with location, phone and hours);
// the catalog only adds a stock per product on top of them and never creates or edits a branch.
type BranchRow = { id: string; name: string; address: string; map_url: string; working_hours: string; latitude: number; longitude: number; active: number | bigint };
const toBranch = (row: BranchRow): Branch => ({ id: row.id, name: row.name, nameEn: "", address: row.address, mapUrl: row.map_url, active: Number(row.active) === 1, workingHours: row.working_hours ?? "", latitude: Number(row.latitude), longitude: Number(row.longitude) });

export async function listBranches(tenantId: string, options: { activeOnly?: boolean } = {}): Promise<Branch[]> {
  await ensureTables();
  const rows = await prisma.$queryRaw<BranchRow[]>`SELECT id, name, address, map_url, working_hours, latitude, longitude, active FROM branches WHERE tenant_id = ${tenantId} ORDER BY created_at ASC`;
  const branches = rows.slice(0, MAX_BRANCHES).map(toBranch);
  return options.activeOnly ? branches.filter((branch) => branch.active) : branches;
}

export async function getBranch(tenantId: string, id: string): Promise<Branch | null> {
  await ensureTables();
  const rows = await prisma.$queryRaw<BranchRow[]>`SELECT id, name, address, map_url, working_hours, latitude, longitude, active FROM branches WHERE tenant_id = ${tenantId} AND id = ${id} LIMIT 1`;
  return rows[0] ? toBranch(rows[0]) : null;
}

/** A branch deleted from the Branches page takes its catalog stock with it. */
export async function deleteBranchStock(tenantId: string, id: string) {
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM catalog_branch_stock WHERE tenant_id = ${tenantId} AND branch_id = ${id}`;
}

// ---- stock per branch ----

/** The stock of the given products at a branch; a product without a row is not tracked there (-1). */
export async function getBranchStock(tenantId: string, branchId: string, productIds?: string[]): Promise<Map<string, number>> {
  await ensureTables();
  const result = new Map<string, number>();
  const rows = productIds
    ? productIds.length
      ? await prisma.$queryRaw<Array<{ product_id: string; stock: number | bigint }>>`SELECT product_id, stock FROM catalog_branch_stock WHERE tenant_id = ${tenantId} AND branch_id = ${branchId} AND product_id IN (${Prisma.join(productIds)})`
      : []
    : await prisma.$queryRaw<Array<{ product_id: string; stock: number | bigint }>>`SELECT product_id, stock FROM catalog_branch_stock WHERE tenant_id = ${tenantId} AND branch_id = ${branchId}`;
  for (const row of rows) result.set(row.product_id, Number(row.stock));
  return result;
}

/** Sets a product's stock at a branch; null / negative = not tracked there. */
export async function setBranchStock(tenantId: string, branchId: string, productId: string, stock: number | null) {
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM catalog_branch_stock WHERE tenant_id = ${tenantId} AND branch_id = ${branchId} AND product_id = ${productId}`;
  if (stock === null || !Number.isFinite(stock) || stock < 0) return;
  await prisma.$executeRaw`INSERT INTO catalog_branch_stock (branch_id, product_id, tenant_id, stock) VALUES (${branchId}, ${productId}, ${tenantId}, ${Math.floor(stock)})`;
}

export type ProductBranch = { id: string; name: string; available: boolean; stock: number };

/**
 * Where a product is sold: every branch with whether the product is available there and its quantity (-1 = not tracked).
 * Stored in the branch stock table: a row of 0 means "not sold at this branch", no row means sold without a count.
 */
export async function getProductBranches(tenantId: string, productId: string): Promise<ProductBranch[]> {
  const branches = await listBranches(tenantId);
  if (!branches.length) return [];
  const rows = await prisma.$queryRaw<Array<{ branch_id: string; stock: number | bigint }>>`SELECT branch_id, stock FROM catalog_branch_stock WHERE tenant_id = ${tenantId} AND product_id = ${productId}`;
  const stock = new Map(rows.map((row) => [row.branch_id, Number(row.stock)]));
  return branches.map((branch) => {
    const value = stock.get(branch.id);
    return { id: branch.id, name: branch.name, available: value === undefined || value > 0, stock: value === undefined || value <= 0 ? -1 : value };
  });
}

export async function setProductBranches(tenantId: string, productId: string, items: Array<{ id: string; available: boolean; stock: number | null }>) {
  const known = new Set((await listBranches(tenantId)).map((branch) => branch.id));
  for (const item of items) {
    if (!known.has(item.id)) continue;
    if (!item.available) await setBranchStock(tenantId, item.id, productId, 0);
    else await setBranchStock(tenantId, item.id, productId, item.stock !== null && item.stock > 0 ? item.stock : null);
  }
}

/**
 * Takes the units of every tracked line at the branch at once; if any line cannot be covered, what was taken goes back and
 * the product that failed is named - two customers can never both buy the last unit.
 */
export async function reserveBranchStock(tenantId: string, branchId: string, lines: Array<{ productId: string; name: string; quantity: number }>): Promise<{ ok: true } | { ok: false; productName: string }> {
  await ensureTables();
  const taken: Array<{ productId: string; quantity: number }> = [];
  for (const line of lines) {
    const changed = await prisma.$executeRaw`UPDATE catalog_branch_stock SET stock = stock - ${line.quantity} WHERE tenant_id = ${tenantId} AND branch_id = ${branchId} AND product_id = ${line.productId} AND stock >= ${line.quantity}`;
    if (changed > 0) {
      taken.push({ productId: line.productId, quantity: line.quantity });
      continue;
    }
    // No row = not tracked at this branch: nothing to take. A row that is too low fails.
    const rows = await prisma.$queryRaw<Array<{ stock: number | bigint }>>`SELECT stock FROM catalog_branch_stock WHERE tenant_id = ${tenantId} AND branch_id = ${branchId} AND product_id = ${line.productId} LIMIT 1`;
    if (!rows.length) continue;
    for (const back of taken) await restockBranch(tenantId, branchId, back.productId, back.quantity);
    return { ok: false, productName: line.name };
  }
  return { ok: true };
}

export async function restockBranch(tenantId: string, branchId: string, productId: string, quantity: number) {
  await ensureTables();
  await prisma.$executeRaw`UPDATE catalog_branch_stock SET stock = stock + ${quantity} WHERE tenant_id = ${tenantId} AND branch_id = ${branchId} AND product_id = ${productId}`;
}

// ---- the customer's choice while checking out ----

export async function setBranchChoice(tenantId: string, conversationId: string, branchId: string) {
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM catalog_branch_choice WHERE conversation_id = ${conversationId}`;
  await prisma.$executeRaw`INSERT INTO catalog_branch_choice (conversation_id, tenant_id, branch_id, created_at) VALUES (${conversationId}, ${tenantId}, ${branchId}, ${new Date().toISOString()})`;
}

/** The branch the customer picked for this checkout (null when none, or when it was a while ago). */
export async function getBranchChoice(tenantId: string, conversationId: string): Promise<Branch | null> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ branch_id: string; created_at: string }>>`SELECT branch_id, created_at FROM catalog_branch_choice WHERE conversation_id = ${conversationId} LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  if (Date.parse(row.created_at) < Date.now() - CHOICE_MINUTES * 60_000) {
    await clearBranchChoice(conversationId);
    return null;
  }
  const branch = await getBranch(tenantId, row.branch_id);
  // A branch that has closed since the customer picked it is asked about again.
  return branch && branch.active && isBranchOpen(branch.workingHours) ? branch : null;
}

export async function clearBranchChoice(conversationId: string) {
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM catalog_branch_choice WHERE conversation_id = ${conversationId}`;
}

// ---- the branch stored with a placed order ----

export async function recordOrderBranch(tenantId: string, orderId: string, branch: Pick<Branch, "id" | "name">) {
  await ensureTables();
  await prisma.$executeRaw`DELETE FROM catalog_order_branch WHERE order_id = ${orderId}`;
  await prisma.$executeRaw`INSERT INTO catalog_order_branch (order_id, tenant_id, branch_id, branch_name) VALUES (${orderId}, ${tenantId}, ${branch.id}, ${branch.name})`;
}

export async function getOrderBranches(orderIds: string[]): Promise<Map<string, { id: string; name: string; mapUrl: string }>> {
  const result = new Map<string, { id: string; name: string; mapUrl: string }>();
  if (!orderIds.length) return result;
  await ensureTables();
  for (let start = 0; start < orderIds.length; start += 200) {
    const batch = orderIds.slice(start, start + 200);
    const rows = await prisma.$queryRaw<Array<{ order_id: string; branch_id: string; branch_name: string }>>`SELECT order_id, branch_id, branch_name FROM catalog_order_branch WHERE order_id IN (${Prisma.join(batch)})`;
    const links = rows.length ? await prisma.$queryRaw<Array<{ branch_id: string; map_url: string }>>`SELECT branch_id, map_url FROM catalog_branch_links WHERE branch_id IN (${Prisma.join([...new Set(rows.map((row) => row.branch_id))])})` : [];
    const urls = new Map(links.map((link) => [link.branch_id, link.map_url]));
    for (const row of rows) result.set(row.order_id, { id: row.branch_id, name: row.branch_name, mapUrl: urls.get(row.branch_id) ?? "" });
  }
  return result;
}

/** The ids of the products switched off at a branch (stock 0 there). */
export async function getUnavailableAtBranch(tenantId: string, branchId: string): Promise<string[]> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ product_id: string }>>`SELECT product_id FROM catalog_branch_stock WHERE tenant_id = ${tenantId} AND branch_id = ${branchId} AND stock = 0`;
  return rows.map((row) => row.product_id);
}

/** The products of a cart that a branch cannot cover (out of stock there, or fewer units than asked). */
export function shortfalls(lines: Array<{ productId: string; name: string; quantity: number }>, stock: Map<string, number>): Array<{ name: string; wanted: number; available: number }> {
  const totals = new Map<string, { name: string; wanted: number }>();
  for (const line of lines) {
    const entry = totals.get(line.productId) ?? { name: line.name, wanted: 0 };
    entry.wanted += line.quantity;
    totals.set(line.productId, entry);
  }
  const result: Array<{ name: string; wanted: number; available: number }> = [];
  for (const [productId, entry] of totals) {
    const available = stock.get(productId);
    if (available !== undefined && available >= 0 && available < entry.wanted) result.push({ name: entry.name, wanted: entry.wanted, available });
  }
  return result;
}
