import { prisma } from "./prisma";

/**
 * Settings of the online-store integrations (Salla, Zid): which order notifications go out, and how
 * abandoned carts are followed up. Stored per workspace and per store as one JSON document in a small
 * table created on first use (raw SQL, no Prisma model).
 *
 * This only keeps the settings. Nothing is sent until the store connection and the sending engine are
 * built on top of it, and the screen says so.
 */

export const STORES = ["salla", "zid"] as const;
export type StoreKey = (typeof STORES)[number];

export function isStoreKey(value: unknown): value is StoreKey {
  return typeof value === "string" && (STORES as readonly string[]).includes(value);
}

export const ORDER_EVENTS = ["created", "processing", "shipped", "delivered", "cancelled"] as const;
export type OrderEvent = (typeof ORDER_EVENTS)[number];

export type OrderEventSetting = { enabled: boolean; template: string };

/** Where an order is, as the customer understands it. Store-specific statuses map onto these (see lib/store-engine.ts). */
export const STATUS_GROUPS = ["review", "processing", "shipped", "delivered", "cancelled", "other"] as const;
export type StatusGroup = (typeof STATUS_GROUPS)[number];

export type OrderLookupSettings = {
  enabled: boolean;
  /** Only answer when the order's phone is the phone of this conversation. Strongly recommended. */
  requirePhoneMatch: boolean;
  /**
   * When the order's phone is not this chat's phone, ask for the last 4 digits of the phone on the order
   * instead of refusing (only meaningful while requirePhoneMatch is on).
   */
  verifyWithLastDigits: boolean;
  /** The question asked for those digits. */
  askDigitsText: string;
  /** Reply per status group. Placeholders: {{order}} {{status}} {{company}} {{tracking}} {{link}} {{name}}. */
  texts: Record<StatusGroup, string>;
  notFoundText: string;
  askNumberText: string;
};

export type StoreSettings = {
  orderNotifications: Record<OrderEvent, OrderEventSetting>;
  orderLookup: OrderLookupSettings;
  abandonedCart: {
    enabled: boolean;
    /** Minutes after the cart was left before the first reminder. */
    delayMinutes: number;
    maxReminders: 1 | 2 | 3;
    /** Hours between reminders. */
    intervalHours: number;
    /** Carts worth less than this (SAR) get no reminder. 0 = every cart. */
    minCartValue: number;
    quietHours: { enabled: boolean; start: string; end: string };
    /** Added to the last reminder when set. */
    discountCode: string;
    /** Zid only: a fresh single-use coupon per customer on the last reminder (needs the app's Coupons scope). */
    uniqueCoupon: { enabled: boolean; percent: number; validHours: number };
    /** One template per reminder (first, second, third). */
    templates: [string, string, string];
    /** Skip customers who ordered in the last N days. 0 = never skip. */
    skipIfOrderedDays: number;
  };
  /** Most store messages per day across all events. 0 = no cap. */
  dailyCap: number;
};

export const DEFAULT_LOOKUP_TEXTS: Record<StatusGroup, string> = {
  review: "طلبك رقم {{order}} قيد المراجعة. سنبدأ تجهيزه قريبًا بإذن الله.",
  processing: "طلبك رقم {{order}} قيد التجهيز الآن، وسنخبرك فور شحنه.",
  shipped: "طلبك رقم {{order}} جاري التوصيل 🚚{{company}}{{tracking}}{{link}}",
  delivered: "طلبك رقم {{order}} تم تسليمه. نتمنى أن ينال إعجابك 🌟",
  cancelled: "طلبك رقم {{order}} ملغي. إن كان لديك استفسار سيتواصل معك أحد موظفينا.",
  other: "حالة طلبك رقم {{order}}: {{status}}."
};

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  orderLookup: {
    enabled: false,
    requirePhoneMatch: true,
    verifyWithLastDigits: true,
    askDigitsText: "للتحقق من الطلب، أرسل آخر 4 أرقام من الجوال المسجّل في الطلب.",
    texts: DEFAULT_LOOKUP_TEXTS,
    notFoundText: "ما قدرنا نلاقي الطلب بهذا الرقم على جوالك. سيتواصل معك أحد موظفينا للمساعدة.",
    askNumberText: "تمام، أرسل لي رقم طلبك وأتحقق لك من حالته."
  },
  orderNotifications: {
    created: { enabled: false, template: "" },
    processing: { enabled: false, template: "" },
    shipped: { enabled: false, template: "" },
    delivered: { enabled: false, template: "" },
    cancelled: { enabled: false, template: "" }
  },
  abandonedCart: {
    enabled: false,
    delayMinutes: 60,
    maxReminders: 1,
    intervalHours: 24,
    minCartValue: 0,
    quietHours: { enabled: true, start: "22:00", end: "08:00" },
    discountCode: "",
    uniqueCoupon: { enabled: false, percent: 10, validHours: 48 },
    templates: ["", "", ""],
    skipIfOrderedDays: 7
  },
  dailyCap: 0
};

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= prisma
    .$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS store_integration_settings (
      tenant_id TEXT NOT NULL,
      store TEXT NOT NULL,
      settings_json TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, store)
    )`)
    .then(() => undefined)
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function templateName(value: unknown): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120) : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Pure: turns anything into a valid settings object (unknown or out-of-range values fall back to the defaults / are clamped). */
export function normalizeStoreSettings(input: unknown): StoreSettings {
  const source = record(input);
  const defaults = DEFAULT_STORE_SETTINGS;

  const orderSource = record(source.orderNotifications);
  const orderNotifications = {} as Record<OrderEvent, OrderEventSetting>;
  for (const event of ORDER_EVENTS) {
    const item = record(orderSource[event]);
    orderNotifications[event] = {
      enabled: typeof item.enabled === "boolean" ? item.enabled : defaults.orderNotifications[event].enabled,
      template: templateName(item.template)
    };
  }

  const lookupSource = record(source.orderLookup);
  const textsSource = record(lookupSource.texts);
  const texts = {} as Record<StatusGroup, string>;
  for (const group of STATUS_GROUPS) {
    const text = typeof textsSource[group] === "string" ? (textsSource[group] as string).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, 800) : "";
    texts[group] = text || DEFAULT_LOOKUP_TEXTS[group];
  }
  const freeText = (value: unknown, fallback: string) => {
    const text = typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, 800) : "";
    return text || fallback;
  };
  const orderLookup: OrderLookupSettings = {
    enabled: typeof lookupSource.enabled === "boolean" ? lookupSource.enabled : defaults.orderLookup.enabled,
    requirePhoneMatch: typeof lookupSource.requirePhoneMatch === "boolean" ? lookupSource.requirePhoneMatch : defaults.orderLookup.requirePhoneMatch,
    verifyWithLastDigits: typeof lookupSource.verifyWithLastDigits === "boolean" ? lookupSource.verifyWithLastDigits : defaults.orderLookup.verifyWithLastDigits,
    askDigitsText: freeText(lookupSource.askDigitsText, defaults.orderLookup.askDigitsText),
    texts,
    notFoundText: freeText(lookupSource.notFoundText, defaults.orderLookup.notFoundText),
    askNumberText: freeText(lookupSource.askNumberText, defaults.orderLookup.askNumberText)
  };

  const cart = record(source.abandonedCart);
  const quiet = record(cart.quietHours);
  const templatesSource = Array.isArray(cart.templates) ? cart.templates : [];
  const maxReminders = clampInt(cart.maxReminders, 1, 3, defaults.abandonedCart.maxReminders) as 1 | 2 | 3;
  const coupon = record(cart.uniqueCoupon);
  const discount = typeof cart.discountCode === "string" ? cart.discountCode.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) : "";

  return {
    orderNotifications,
    orderLookup,
    abandonedCart: {
      enabled: typeof cart.enabled === "boolean" ? cart.enabled : defaults.abandonedCart.enabled,
      delayMinutes: clampInt(cart.delayMinutes, 10, 1440, defaults.abandonedCart.delayMinutes),
      maxReminders,
      intervalHours: clampInt(cart.intervalHours, 1, 168, defaults.abandonedCart.intervalHours),
      minCartValue: clampInt(cart.minCartValue, 0, 1_000_000, defaults.abandonedCart.minCartValue),
      quietHours: {
        enabled: typeof quiet.enabled === "boolean" ? quiet.enabled : defaults.abandonedCart.quietHours.enabled,
        start: typeof quiet.start === "string" && TIME.test(quiet.start) ? quiet.start : defaults.abandonedCart.quietHours.start,
        end: typeof quiet.end === "string" && TIME.test(quiet.end) ? quiet.end : defaults.abandonedCart.quietHours.end
      },
      discountCode: discount,
      uniqueCoupon: {
        enabled: typeof coupon.enabled === "boolean" ? coupon.enabled : defaults.abandonedCart.uniqueCoupon.enabled,
        percent: clampInt(coupon.percent, 1, 90, defaults.abandonedCart.uniqueCoupon.percent),
        validHours: clampInt(coupon.validHours, 6, 720, defaults.abandonedCart.uniqueCoupon.validHours)
      },
      templates: [templateName(templatesSource[0]), templateName(templatesSource[1]), templateName(templatesSource[2])],
      skipIfOrderedDays: clampInt(cart.skipIfOrderedDays, 0, 90, defaults.abandonedCart.skipIfOrderedDays)
    },
    dailyCap: clampInt(source.dailyCap, 0, 100_000, defaults.dailyCap)
  };
}

/** Problems that make the settings unusable when switched on (a template is needed to send anything). */
export function storeSettingsWarnings(settings: StoreSettings): string[] {
  const warnings: string[] = [];
  for (const event of ORDER_EVENTS) {
    const item = settings.orderNotifications[event];
    if (item.enabled && !item.template) warnings.push(`order:${event}`);
  }
  const cart = settings.abandonedCart;
  if (cart.enabled) {
    for (let index = 0; index < cart.maxReminders; index += 1) {
      if (!cart.templates[index]) warnings.push(`cart:${index + 1}`);
    }
  }
  return warnings;
}

export async function getStoreSettings(tenantId: string, store: StoreKey): Promise<{ settings: StoreSettings; updatedAt: string }> {
  await ensureTable();
  const rows = await prisma.$queryRaw<Array<{ settings_json: string; updated_at: string }>>`SELECT settings_json, updated_at FROM store_integration_settings WHERE tenant_id = ${tenantId} AND store = ${store} LIMIT 1`;
  const row = rows[0];
  let parsed: unknown = {};
  try {
    parsed = row?.settings_json ? JSON.parse(row.settings_json) : {};
  } catch {
    parsed = {};
  }
  return { settings: normalizeStoreSettings(parsed), updatedAt: row?.updated_at ?? "" };
}

export async function saveStoreSettings(tenantId: string, store: StoreKey, input: unknown): Promise<{ settings: StoreSettings; updatedAt: string }> {
  await ensureTable();
  const settings = normalizeStoreSettings(input);
  const json = JSON.stringify(settings);
  const now = new Date().toISOString();
  const existing = await prisma.$queryRaw<Array<{ tenant_id: string }>>`SELECT tenant_id FROM store_integration_settings WHERE tenant_id = ${tenantId} AND store = ${store} LIMIT 1`;
  if (existing.length) {
    await prisma.$executeRaw`UPDATE store_integration_settings SET settings_json = ${json}, updated_at = ${now} WHERE tenant_id = ${tenantId} AND store = ${store}`;
  } else {
    await prisma.$executeRaw`INSERT INTO store_integration_settings (tenant_id, store, settings_json, updated_at) VALUES (${tenantId}, ${store}, ${json}, ${now})`;
  }
  return { settings, updatedAt: now };
}
