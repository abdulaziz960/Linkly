import { prisma } from "./prisma";

/**
 * 2026-10 price update: 199 / 349 / 599 / 899 / 1599. The plan seed only
 * runs on a fresh database, so existing databases get the new prices here.
 * Each update only fires while the row still holds its OLD default price -
 * a price an admin has since set by hand is never overwritten, and running
 * this on every start is harmless once the prices have moved.
 */
export const PLAN_PRICE_UPDATES: Array<{ id: string; from: number; to: number }> = [
  { id: "plan-regular", from: 279, to: 349 },
  { id: "plan-small-org", from: 615, to: 599 },
  { id: "plan-large-org", from: 849, to: 899 },
  { id: "plan-enterprise", from: 1499, to: 1599 }
];

export async function ensurePlanPrices() {
  const now = new Date().toISOString();
  for (const update of PLAN_PRICE_UPDATES) {
    await prisma.plan.updateMany({ where: { id: update.id, monthlyPrice: update.from }, data: { monthlyPrice: update.to, updatedAt: now } });
  }
}
