// Loyalty for sales that happen directly in WhatsApp (the chat catalog and its payment link). After a customer has paid
// for N orders, the merchant's reward is issued as a single-use discount code made for that customer, or a free product
// (a code worth the product's price). Orders of connected stores (Zid, Salla, Shopify) never count.

import { randomInt, randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { ensureCatalogSchema } from "./catalog-schema";
import { createDiscount } from "./catalog-discounts";

export type LoyaltyRewardKind = "percent" | "fixed" | "free_product";

export type LoyaltySettings = {
  enabled: boolean;
  /** Paid orders needed for the reward. */
  goal: number;
  rewardKind: LoyaltyRewardKind;
  /** Percent or fixed amount (unused for a free product). */
  rewardValue: number;
  productId: string;
  validDays: number;
  notifyProgress: boolean;
  progressText: string;
  rewardText: string;
};

export const DEFAULT_PROGRESS_TEXT = "شكرًا لطلبك {name}! أكملت {done} من {goal} طلبات في برنامج الولاء، وبقي {left} للحصول على {reward}.";
export const DEFAULT_REWARD_TEXT = "مبروك {name}! أكملت {goal} طلبات وحصلت على {reward}. استخدم كود الخصم {code} في طلبك القادم (صالح حتى {date}، لك وحدك ويُستخدم مرة واحدة).";

export const DEFAULT_LOYALTY: LoyaltySettings = {
  enabled: false,
  goal: 4,
  rewardKind: "percent",
  rewardValue: 20,
  productId: "",
  validDays: 30,
  notifyProgress: true,
  progressText: DEFAULT_PROGRESS_TEXT,
  rewardText: DEFAULT_REWARD_TEXT
};

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= ensureCatalogSchema().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

/** A phone as digits, for matching the same customer however the number was written. */
export function loyaltyPhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^00/, "");
}

export function samePhoneDigits(a: string, b: string): boolean {
  const left = loyaltyPhone(a).slice(-9);
  const right = loyaltyPhone(b).slice(-9);
  return left.length === 9 && left === right;
}

function cleanText(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, 600) : "";
  return text || fallback;
}

/** Pure: a loose object (from the request or the database) into valid settings. */
export function cleanLoyaltySettings(input: unknown): LoyaltySettings {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const kind: LoyaltyRewardKind = source.rewardKind === "fixed" || source.rewardKind === "free_product" ? source.rewardKind : "percent";
  const goal = Math.min(50, Math.max(1, Math.floor(Number(source.goal)) || DEFAULT_LOYALTY.goal));
  const rawValue = Number(source.rewardValue);
  const value = Number.isFinite(rawValue) && rawValue > 0 ? rawValue : DEFAULT_LOYALTY.rewardValue;
  return {
    enabled: source.enabled === true,
    goal,
    rewardKind: kind,
    rewardValue: kind === "percent" ? Math.min(90, value) : Math.min(100_000, value),
    productId: typeof source.productId === "string" ? source.productId.trim().slice(0, 100) : "",
    validDays: Math.min(365, Math.max(1, Math.floor(Number(source.validDays)) || DEFAULT_LOYALTY.validDays)),
    notifyProgress: source.notifyProgress !== false,
    progressText: cleanText(source.progressText, DEFAULT_PROGRESS_TEXT),
    rewardText: cleanText(source.rewardText, DEFAULT_REWARD_TEXT)
  };
}

type SettingsRow = { enabled: number | bigint; goal: number | bigint; reward_kind: string; reward_value: number; product_id: string; valid_days: number | bigint; notify_progress: number | bigint; progress_text: string; reward_text: string };

export async function getLoyaltySettings(tenantId: string): Promise<LoyaltySettings> {
  await ensureTables();
  const rows = await prisma.$queryRaw<SettingsRow[]>`SELECT enabled, goal, reward_kind, reward_value, product_id, valid_days, notify_progress, progress_text, reward_text FROM loyalty_settings WHERE tenant_id = ${tenantId} LIMIT 1`;
  const row = rows[0];
  if (!row) return DEFAULT_LOYALTY;
  return cleanLoyaltySettings({ enabled: Number(row.enabled) === 1, goal: Number(row.goal), rewardKind: row.reward_kind, rewardValue: Number(row.reward_value), productId: row.product_id, validDays: Number(row.valid_days), notifyProgress: Number(row.notify_progress) === 1, progressText: row.progress_text, rewardText: row.reward_text });
}

export async function saveLoyaltySettings(tenantId: string, input: unknown): Promise<LoyaltySettings> {
  await ensureTables();
  const s = cleanLoyaltySettings(input);
  const now = new Date().toISOString();
  await prisma.$executeRaw`INSERT INTO loyalty_settings (tenant_id, enabled, goal, reward_kind, reward_value, product_id, valid_days, notify_progress, progress_text, reward_text, updated_at)
    VALUES (${tenantId}, ${s.enabled ? 1 : 0}, ${s.goal}, ${s.rewardKind}, ${s.rewardValue}, ${s.productId}, ${s.validDays}, ${s.notifyProgress ? 1 : 0}, ${s.progressText}, ${s.rewardText}, ${now})
    ON CONFLICT (tenant_id) DO UPDATE SET enabled = ${s.enabled ? 1 : 0}, goal = ${s.goal}, reward_kind = ${s.rewardKind}, reward_value = ${s.rewardValue}, product_id = ${s.productId}, valid_days = ${s.validDays}, notify_progress = ${s.notifyProgress ? 1 : 0}, progress_text = ${s.progressText}, reward_text = ${s.rewardText}, updated_at = ${now}`;
  return s;
}

/** Pure: fills {name} {done} {goal} {left} {reward} {code} {date} in a message. */
export function renderLoyaltyText(template: string, values: { name?: string; done?: number; goal?: number; reward?: string; code?: string; date?: string }): string {
  const done = values.done ?? 0;
  const goal = values.goal ?? 0;
  const map: Record<string, string> = { name: values.name?.trim() || "عميلنا", done: String(done), goal: String(goal), left: String(Math.max(0, goal - done)), reward: values.reward ?? "", code: values.code ?? "", date: values.date ?? "" };
  return template.replace(/\{\s*(name|done|goal|left|reward|code|date)\s*\}/g, (_, key: string) => map[key]);
}

/** Pure: how the reward is described to the customer. */
export function rewardLabel(settings: Pick<LoyaltySettings, "rewardKind" | "rewardValue">, productName = ""): string {
  if (settings.rewardKind === "free_product") return productName ? `${productName} مجانًا` : "منتج مجاني";
  if (settings.rewardKind === "fixed") return `خصم ${settings.rewardValue} ر.س`;
  return `خصم ${settings.rewardValue}%`;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomLoyaltyCode(): string {
  return `WAFA-${Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("")}`;
}

function expiryDate(days: number, now = new Date()): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

export type IssuedReward = { code: string; description: string; expiresAt: string };

/** Creates the customer's reward as a single-use code; null when the reward cannot be made (for example the free product is gone). */
async function issueReward(tenantId: string, phone: string, orderId: string, settings: LoyaltySettings): Promise<IssuedReward | null> {
  let kind: "percent" | "fixed" = settings.rewardKind === "percent" ? "percent" : "fixed";
  let value = settings.rewardValue;
  let minOrder = 0;
  let productName = "";
  if (settings.rewardKind === "free_product") {
    const product = settings.productId ? await prisma.product.findFirst({ where: { id: settings.productId, tenantId, active: 1 } }) : null;
    if (!product) return null;
    kind = "fixed";
    value = product.price;
    minOrder = product.price;
    productName = product.name;
  }
  const expires = expiryDate(settings.validDays);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = randomLoyaltyCode();
    const created = await createDiscount(tenantId, { code, kind, value, minOrder, maxUses: 1, expiresAt: expires });
    if (!created.ok) continue;
    const description = rewardLabel(settings, productName);
    await prisma.$executeRaw`INSERT INTO loyalty_rewards (id, tenant_id, phone, code, description, expires_at, order_id, created_at) VALUES (${`lr-${randomUUID()}`}, ${tenantId}, ${loyaltyPhone(phone)}, ${code}, ${description}, ${expires}, ${orderId}, ${new Date().toISOString()})`;
    return { code, description, expiresAt: expires };
  }
  return null;
}

export type LoyaltyOrder = { id: string; tenantId: string; customerName: string; customerPhone: string; paymentId: string; conversationId: string };

export type LoyaltyOutcome = { counted: boolean; reason?: string; done?: number; reward?: IssuedReward };

/**
 * Counts one paid WhatsApp order for the customer's loyalty, once. Returns what happened; never throws (a failure here
 * must not touch the order's payment). Sending the customer's messages is left to the caller (see notifyLoyalty).
 */
export async function recordPaidOrderForLoyalty(order: LoyaltyOrder): Promise<LoyaltyOutcome> {
  try {
    // Orders made in a connected store are not WhatsApp sales: their payment id is the store's.
    if (/^(zid|salla|shopify)-/i.test(order.paymentId)) return { counted: false, reason: "store-order" };
    const phone = loyaltyPhone(order.customerPhone);
    if (phone.length < 9) return { counted: false, reason: "no-phone" };
    const settings = await getLoyaltySettings(order.tenantId);
    if (!settings.enabled) return { counted: false, reason: "off" };

    // The same order is never counted twice (the payment callback can arrive more than once).
    const claimed = await prisma.$executeRaw`INSERT INTO loyalty_counted_orders (order_id, tenant_id, phone, counted_at) VALUES (${order.id}, ${order.tenantId}, ${phone}, ${new Date().toISOString()}) ON CONFLICT (order_id) DO NOTHING`;
    if (Number(claimed) === 0) return { counted: false, reason: "already-counted" };

    const now = new Date().toISOString();
    const existing = await prisma.$queryRaw<Array<{ orders_in_cycle: number | bigint }>>`SELECT orders_in_cycle FROM loyalty_progress WHERE tenant_id = ${order.tenantId} AND phone = ${phone} LIMIT 1`;
    const before = existing[0] ? Number(existing[0].orders_in_cycle) : 0;
    const done = before + 1;
    const rewarded = done >= settings.goal;
    const reward = rewarded ? await issueReward(order.tenantId, phone, order.id, settings) : null;
    // The cycle starts over only once a reward was really issued; if it could not be made the progress is kept for the merchant to fix.
    const nextInCycle = rewarded && reward ? 0 : done;
    await prisma.$executeRaw`INSERT INTO loyalty_progress (tenant_id, phone, orders_in_cycle, total_orders, rewards_given, updated_at) VALUES (${order.tenantId}, ${phone}, ${nextInCycle}, 1, ${reward ? 1 : 0}, ${now})
      ON CONFLICT (tenant_id, phone) DO UPDATE SET orders_in_cycle = ${nextInCycle}, total_orders = loyalty_progress.total_orders + 1, rewards_given = loyalty_progress.rewards_given + ${reward ? 1 : 0}, updated_at = ${now}`;
    return { counted: true, done, ...(reward ? { reward } : {}) };
  } catch (error) {
    console.error("Loyalty counting failed", error);
    return { counted: false, reason: "error" };
  }
}

/** The WhatsApp message for the customer after a counted order, or "" when nothing should be sent. */
export async function loyaltyMessageFor(order: LoyaltyOrder, outcome: LoyaltyOutcome): Promise<string> {
  if (!outcome.counted) return "";
  const settings = await getLoyaltySettings(order.tenantId);
  const name = order.customerName;
  if (outcome.reward) {
    return renderLoyaltyText(settings.rewardText, { name, goal: settings.goal, done: settings.goal, reward: outcome.reward.description, code: outcome.reward.code, date: outcome.reward.expiresAt });
  }
  if (!settings.notifyProgress || (outcome.done ?? 0) >= settings.goal) return "";
  const product = settings.rewardKind === "free_product" && settings.productId ? await prisma.product.findFirst({ where: { id: settings.productId, tenantId: order.tenantId } }) : null;
  return renderLoyaltyText(settings.progressText, { name, done: outcome.done ?? 0, goal: settings.goal, reward: rewardLabel(settings, product?.name ?? "") });
}

export type LoyaltyCustomerRow = { phone: string; ordersInCycle: number; totalOrders: number; rewardsGiven: number; updatedAt: string };
export type LoyaltyRewardRow = { phone: string; code: string; description: string; expiresAt: string; createdAt: string };

export async function listLoyalty(tenantId: string): Promise<{ customers: LoyaltyCustomerRow[]; rewards: LoyaltyRewardRow[] }> {
  await ensureTables();
  const customers = await prisma.$queryRaw<Array<{ phone: string; orders_in_cycle: number | bigint; total_orders: number | bigint; rewards_given: number | bigint; updated_at: string }>>`SELECT phone, orders_in_cycle, total_orders, rewards_given, updated_at FROM loyalty_progress WHERE tenant_id = ${tenantId} ORDER BY total_orders DESC, updated_at DESC LIMIT 200`;
  const rewards = await prisma.$queryRaw<Array<{ phone: string; code: string; description: string; expires_at: string; created_at: string }>>`SELECT phone, code, description, expires_at, created_at FROM loyalty_rewards WHERE tenant_id = ${tenantId} ORDER BY created_at DESC LIMIT 100`;
  return {
    customers: customers.map((row) => ({ phone: row.phone, ordersInCycle: Number(row.orders_in_cycle), totalOrders: Number(row.total_orders), rewardsGiven: Number(row.rewards_given), updatedAt: row.updated_at })),
    rewards: rewards.map((row) => ({ phone: row.phone, code: row.code, description: row.description, expiresAt: row.expires_at, createdAt: row.created_at }))
  };
}

/** Whether a loyalty code belongs to another customer than the one using it (loyalty codes are personal). Unknown codes are nobody's. */
export async function loyaltyCodeBelongsToOther(tenantId: string, code: string, customerPhone: string): Promise<boolean> {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ phone: string }>>`SELECT phone FROM loyalty_rewards WHERE tenant_id = ${tenantId} AND code = ${code} LIMIT 1`;
  return Boolean(rows[0]) && !samePhoneDigits(rows[0].phone, customerPhone);
}

/** Resets a customer's current cycle (the merchant's decision). */
export async function resetLoyaltyCycle(tenantId: string, phone: string): Promise<void> {
  await ensureTables();
  await prisma.$executeRaw`UPDATE loyalty_progress SET orders_in_cycle = 0, updated_at = ${new Date().toISOString()} WHERE tenant_id = ${tenantId} AND phone = ${loyaltyPhone(phone)}`;
}

const LOYALTY_WORDS = /(ولاء|نقاطي|نقاط|رصيدي|مكافا|(كم\s*)?(بقي|باقي|باقى)\s*(لي|علي|عندي)|كود\s*الخصم\s*(حقي|الي|اللي|عندي)|loyalty|my\s*rewards?|my\s*points)/i;

/** Pure: whether a customer's message asks about their loyalty progress or reward (short messages only). */
export function looksLikeLoyaltyQuestion(text: string): boolean {
  const value = text
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim();
  if (!value || value.length > 120) return false;
  // "مكافأة" loses its hamza above, so the stem is matched without it; an order question is never a loyalty question.
  if (/(وين|فين)\s*(طلب|شحن)/.test(value)) return false;
  return LOYALTY_WORDS.test(value.replace(/مكافات/g, "مكافا").replace(/مكافاه/g, "مكافا"));
}

/** The customer's unused, unexpired reward codes. */
export async function activeRewardsFor(tenantId: string, phone: string, now = new Date()): Promise<IssuedReward[]> {
  await ensureTables();
  const today = now.toISOString().slice(0, 10);
  const rows = await prisma.$queryRaw<Array<{ phone: string; code: string; description: string; expires_at: string }>>`
    SELECT r.phone, r.code, r.description, r.expires_at FROM loyalty_rewards r
    JOIN catalog_discounts d ON d.tenant_id = r.tenant_id AND d.code = r.code
    WHERE r.tenant_id = ${tenantId} AND d.active = 1 AND (d.max_uses = 0 OR d.used_count < d.max_uses) AND (r.expires_at = '' OR r.expires_at >= ${today})
    ORDER BY r.created_at DESC LIMIT 20`;
  return rows.filter((row) => samePhoneDigits(row.phone, phone)).map((row) => ({ code: row.code, description: row.description, expiresAt: row.expires_at }));
}

/** The reply to "how many do I have left?": progress in the current cycle and any reward code still usable. */
export async function loyaltyStatusText(tenantId: string, phone: string, name = ""): Promise<string> {
  const settings = await getLoyaltySettings(tenantId);
  const rows = await prisma.$queryRaw<Array<{ phone: string; orders_in_cycle: number | bigint }>>`SELECT phone, orders_in_cycle FROM loyalty_progress WHERE tenant_id = ${tenantId} AND phone = ${loyaltyPhone(phone)} LIMIT 1`;
  const done = rows[0] ? Number(rows[0].orders_in_cycle) : 0;
  const product = settings.rewardKind === "free_product" && settings.productId ? await prisma.product.findFirst({ where: { id: settings.productId, tenantId } }) : null;
  const reward = rewardLabel(settings, product?.name ?? "");
  const parts = [renderLoyaltyText("أهلًا {name}، في برنامج الولاء أكملت {done} من {goal} طلبات، وبقي {left} للحصول على {reward}.", { name, done, goal: settings.goal, reward })];
  const active = await activeRewardsFor(tenantId, phone);
  for (const item of active) parts.push(`لديك مكافأة جاهزة: ${item.description}، كود الخصم ${item.code}${item.expiresAt ? ` (صالح حتى ${item.expiresAt})` : ""}.`);
  return parts.join("\n\n");
}
