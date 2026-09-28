// Pure, isomorphic (client + server) catalog - no Prisma import here on
// purpose, so client components (the admin plan editor) can import this
// directly. Tenant/plan lookups that need the database live in
// lib/plan-channel-access.ts instead.

// Every channel a plan can restrict access to. Mirrors the IntegrationChannel
// union in app/api/settings/integration/route.ts, minus "website" - the
// built-in chat widget isn't an external channel a tenant "connects" and is
// never plan-gated.
export type ChannelKey =
  | "whatsapp" | "instagram" | "facebook" | "meta_leads" | "telegram" | "x"
  | "google_maps" | "email" | "tiktok" | "sms" | "youtube" | "linkedin" | "snapchat";

export const CHANNEL_CATALOG: Array<{ key: ChannelKey; labelAr: string; labelEn: string }> = [
  { key: "whatsapp", labelAr: "واتساب", labelEn: "WhatsApp" },
  { key: "instagram", labelAr: "انستقرام", labelEn: "Instagram" },
  { key: "facebook", labelAr: "فيسبوك ماسنجر", labelEn: "Facebook Messenger" },
  { key: "meta_leads", labelAr: "نماذج العملاء المحتملين (ميتا)", labelEn: "Meta Lead Ads" },
  { key: "telegram", labelAr: "تيليجرام", labelEn: "Telegram" },
  { key: "x", labelAr: "إكس (تويتر)", labelEn: "X (Twitter)" },
  { key: "google_maps", labelAr: "بروفايل جوجل للأعمال", labelEn: "Google Business Profile" },
  { key: "email", labelAr: "البريد الإلكتروني", labelEn: "Email" },
  { key: "tiktok", labelAr: "تيك توك", labelEn: "TikTok" },
  { key: "sms", labelAr: "الرسائل النصية", labelEn: "SMS" },
  { key: "youtube", labelAr: "يوتيوب", labelEn: "YouTube" },
  { key: "linkedin", labelAr: "لينكدإن", labelEn: "LinkedIn" },
  { key: "snapchat", labelAr: "سناب شات", labelEn: "Snapchat" }
];

const channelKeySet = new Set<string>(CHANNEL_CATALOG.map((entry) => entry.key));

export function isValidChannelKey(value: string): value is ChannelKey {
  return channelKeySet.has(value);
}

export function channelLabel(channel: ChannelKey, lang: "ar" | "en" = "ar"): string {
  const entry = CHANNEL_CATALOG.find((item) => item.key === channel);
  if (!entry) return channel;
  return lang === "en" ? entry.labelEn : entry.labelAr;
}

/** "*" means unrestricted; anything else is the exact set of allowed keys (possibly empty, meaning none). */
export type AllowedChannels = "*" | ChannelKey[];

export function parseAllowedChannels(value: string): AllowedChannels {
  const trimmed = value.trim();
  if (trimmed === "*") return "*";
  if (!trimmed) return [];
  return trimmed.split(",").map((entry) => entry.trim()).filter(isValidChannelKey);
}

/** Pass "*" for unrestricted, or an array (possibly empty) of exact keys. */
export function serializeAllowedChannels(value: AllowedChannels): string {
  if (value === "*") return "*";
  return Array.from(new Set(value.filter(isValidChannelKey))).join(",");
}

/** Validates an admin-supplied JSON value (raw request body field) into an AllowedChannels. Anything unrecognized is dropped rather than rejected outright. */
export function sanitizeAllowedChannelsInput(value: unknown): AllowedChannels {
  if (value === "*") return "*";
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string" && isValidChannelKey(entry)) as ChannelKey[];
  return "*";
}

export function upgradeNeededMessage(channel: ChannelKey): string {
  return `قناة ${channelLabel(channel)} غير متاحة بباقتك الحالية. رقّي باقتك من صفحة الفوترة لتفعيلها.`;
}
