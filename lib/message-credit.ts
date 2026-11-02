import type { Prisma } from "@prisma/client";
import { PAYMENT_STATUS } from "./payment-status";

// Message credit has two parts inside one balance: what the plan includes for the period, and what was bought or added by hand.
// The plan's part is replaced every time the subscription is paid (what was not used does not carry over); the bought part stays.
// Spending is not tracked per part, so the plan's part is taken to be used first: the bought part still left is
// min(what was ever bought and still marked as such, the balance now).

/** Stored in purchased_balance for a balance that existed before this rule: its bought part is worked out from the payments. */
export const UNKNOWN_PURCHASED = -1;

export const EMAIL_TOPUP_MARKER = "email_promotions_topup";

/** The bought part of a balance right now. */
export function purchasedPortion(purchased: number, balance: number, boughtEver: number): number {
  const known = purchased >= 0 ? purchased : boughtEver;
  return Math.max(0, Math.min(known, balance));
}

/** The plan was paid again: unused plan credit goes, the bought part stays, the new allowance is added. */
export function renewPlanCredit(input: { balance: number; purchased: number; boughtEver: number; allowance: number }): { balance: number; purchased: number } {
  const keep = purchasedPortion(input.purchased, input.balance, input.boughtEver);
  return { balance: keep + Math.max(0, input.allowance), purchased: keep };
}

/** Credit was bought or added by hand. A balance not yet split keeps being worked out from the payments, which already include this one. */
export function addPurchasedCredit(input: { balance: number; purchased: number; messages: number }): { balance: number; purchased: number } {
  const balance = input.balance + input.messages;
  if (input.purchased < 0) return { balance, purchased: UNKNOWN_PURCHASED };
  return { balance, purchased: Math.min(input.purchased, input.balance) + input.messages };
}

type Db = Pick<Prisma.TransactionClient, "campaignPayment">;

/** Everything completed that a tenant ever bought or was given by hand, for one kind of credit. */
export async function boughtEver(db: Db, tenantId: string, kind: "whatsapp" | "email"): Promise<number> {
  const rows = await db.campaignPayment.findMany({ where: { tenantId, status: PAYMENT_STATUS.completed }, select: { messages: true, metadataJson: true } });
  return rows
    .filter((row) => (row.metadataJson || "").includes(EMAIL_TOPUP_MARKER) === (kind === "email"))
    .reduce((total, row) => total + row.messages, 0);
}

export type CreditState = { balance: number; purchased: number };

/**
 * Changes a stored credit balance from what was read, without overwriting a send that spends one meanwhile: the write only
 * lands if the row is still as it was read (otherwise it reads again). `insert` may fail when another request created the row first.
 */
export async function updateCredit(io: {
  read: () => Promise<CreditState | null>;
  swap: (previous: CreditState, next: CreditState) => Promise<boolean>;
  insert: (next: CreditState) => Promise<void>;
}, compute: (previous: CreditState) => CreditState): Promise<CreditState> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const previous = await io.read();
    if (!previous) {
      const next = compute({ balance: 0, purchased: UNKNOWN_PURCHASED });
      try { await io.insert(next); return next; } catch { continue; }
    }
    const next = compute(previous);
    if (await io.swap(previous, next)) return next;
  }
  throw new Error("تعذر تحديث رصيد الرسائل، حاول مرة أخرى");
}
