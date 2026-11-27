import { ensureSchema } from "./database";
import { fetchMoyasarPayment, type MoyasarPaymentDetails } from "./moyasar";
import { PAYMENT_GATEWAY, PAYMENT_STATUS } from "./payment-status";
import { prisma } from "./prisma";

/**
 * The cards a client paid with, for the platform team. Linkly never holds card data beyond the saved card's
 * brand and last four digits (lib/subscriptions.ts), so the cards behind past payments are read from Moyasar on
 * demand: brand and last four digits only. The card token never leaves this module's callers - it is not returned.
 */

/** Newest payments looked up at Moyasar per request; older ones are listed without their card. */
export const CARD_LOOKUP_LIMIT = 25;
const LOOKUP_TIMEOUT_MS = 8_000;

export type SavedCard = { brand: string; last4: string; autoRenewEnabled: boolean; failCount: number };
export type CardPayment = {
  id: string;
  source: "subscription" | "campaign";
  amount: number;
  status: string;
  date: string;
  method: string;
  brand: string;
  last4: string;
  /** "found" - Moyasar returned a card; "none" - paid without a card (STC Pay...); "unavailable" - could not be asked or was not asked. */
  lookup: "found" | "none" | "unavailable";
};
export type UsedCard = { brand: string; last4: string; payments: number; paidCount: number; paidAmount: number; lastUsed: string; saved: boolean };
export type ClientCards = { saved: SavedCard | null; cards: UsedCard[]; payments: CardPayment[]; truncated: boolean };

type Lookup = (id: string) => Promise<MoyasarPaymentDetails | null>;

function withTimeout(lookup: Lookup, id: string): Promise<MoyasarPaymentDetails | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS); });
  return Promise.race([lookup(id).catch(() => null), timeout]).finally(() => clearTimeout(timer));
}

const brandKey = (brand: string) => brand.trim().toLowerCase();

export async function getClientCards(tenantId: string, lookup: Lookup = fetchMoyasarPayment): Promise<ClientCards | null> {
  await ensureSchema();
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    // The token itself is never selected: nothing here needs it.
    select: { autoRenewEnabled: true, savedCardLast4: true, savedCardBrand: true, autoRenewFailCount: true }
  });
  if (!subscription) return null;
  const saved: SavedCard | null = subscription.savedCardLast4 || subscription.autoRenewEnabled === 1
    ? { brand: subscription.savedCardBrand, last4: subscription.savedCardLast4, autoRenewEnabled: subscription.autoRenewEnabled === 1, failCount: subscription.autoRenewFailCount }
    : null;

  const where = { tenantId, gateway: PAYMENT_GATEWAY.moyasar, gatewayPaymentId: { not: "" } };
  const query = { where, orderBy: { createdAt: "desc" as const }, take: CARD_LOOKUP_LIMIT + 1, select: { id: true, amount: true, status: true, createdAt: true, completedAt: true, paymentMethod: true, gatewayPaymentId: true } };
  const [subscriptionRows, campaignRows] = await Promise.all([prisma.subscriptionPayment.findMany(query), prisma.campaignPayment.findMany(query)]);
  const rows = [
    ...subscriptionRows.map((row) => ({ ...row, source: "subscription" as const })),
    ...campaignRows.map((row) => ({ ...row, source: "campaign" as const }))
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const payments = await Promise.all(rows.slice(0, CARD_LOOKUP_LIMIT).map(async (row): Promise<CardPayment> => {
    const found = await withTimeout(lookup, row.gatewayPaymentId);
    const last4 = found?.cardLast4 ?? "";
    return {
      id: row.id,
      source: row.source,
      amount: row.amount,
      status: row.status,
      date: row.completedAt || row.createdAt,
      method: row.paymentMethod,
      brand: last4 ? found!.sourceCompany : "",
      last4,
      lookup: last4 ? "found" : found ? "none" : "unavailable"
    };
  }));

  const cards = new Map<string, UsedCard>();
  for (const payment of payments) {
    if (!payment.last4) continue;
    const key = `${brandKey(payment.brand)}:${payment.last4}`;
    const card = cards.get(key) ?? { brand: payment.brand, last4: payment.last4, payments: 0, paidCount: 0, paidAmount: 0, lastUsed: payment.date, saved: false };
    card.payments += 1;
    if (payment.status === PAYMENT_STATUS.completed) {
      card.paidCount += 1;
      card.paidAmount = Math.round((card.paidAmount + payment.amount) * 100) / 100;
    }
    cards.set(key, card);
  }
  if (saved?.last4) {
    for (const card of cards.values()) card.saved = card.last4 === saved.last4 && (!saved.brand || brandKey(card.brand) === brandKey(saved.brand));
  }

  return { saved, cards: [...cards.values()], payments, truncated: rows.length > CARD_LOOKUP_LIMIT };
}

/** Removes the saved card and stops auto-renew - the same thing the owner's own "disable" does. Returns what was removed. */
export async function removeSavedCard(tenantId: string): Promise<{ brand: string; last4: string } | null> {
  await ensureSchema();
  const before = await prisma.subscription.findUnique({ where: { tenantId }, select: { savedCardLast4: true, savedCardBrand: true, autoRenewEnabled: true } });
  if (!before || (!before.savedCardLast4 && before.autoRenewEnabled !== 1)) return null;
  await prisma.subscription.update({
    where: { tenantId },
    data: { autoRenewEnabled: 0, savedCardToken: "", savedCardLast4: "", savedCardBrand: "", autoRenewFailCount: 0, updatedAt: new Date().toISOString() }
  });
  return { brand: before.savedCardBrand, last4: before.savedCardLast4 };
}
